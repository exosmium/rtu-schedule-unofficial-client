import sift from 'sift';
import { RTUApiClient } from '../api-client.js';
import { DiscoveryService } from './discovery.js';
import { InvalidQueryError, PeriodNotFoundError } from './errors.js';
import { QueryResult } from './query-result.js';
import { Resolver } from './resolver.js';
import type {
  QueryError,
  QueryScope,
  StudyCourse,
  StudyGroup,
  StudyProgram,
} from './types.js';
import {
  getMonthsBetween,
  parseDate,
  transformToScheduleEntry,
} from './utils.js';

export async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= tasks.length) return;
    try {
      results[index] = { status: 'fulfilled', value: await tasks[index]!() };
    } catch (err) {
      results[index] = {
        status: 'rejected',
        reason: err,
      };
    }
    await runNext();
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext()
  );
  await Promise.all(workers);

  return results;
}

interface FetchTarget {
  semesterProgramId: number;
  program: StudyProgram;
  course: StudyCourse;
  group: StudyGroup | undefined;
}

export class ScheduleQuery {
  constructor(
    private discoveryService: DiscoveryService,
    private resolver: Resolver,
    private apiClient: RTUApiClient
  ) {}

  async execute(
    filter: Record<string, unknown>,
    scope: QueryScope = {}
  ): Promise<QueryResult> {
    // Step 1 — Validate filter
    try {
      sift(filter);
    } catch (err) {
      throw new InvalidQueryError(
        `The filter object is not a valid sift query: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Step 2 — Resolve period
    const periodObj =
      scope.period !== undefined
        ? await this.resolver.resolvePeriod(scope.period)
        : await this.discoveryService.discoverCurrentPeriod();
    if (!periodObj) throw new PeriodNotFoundError('current');

    // Step 3 — Resolve programs
    const programs =
      scope.program !== undefined
        ? [await this.resolver.resolveProgram(scope.program, periodObj.id)]
        : await this.discoveryService.discoverPrograms(periodObj.id);

    // Step 5 — Determine date range (before step 4 so we have the dates for the estimate)
    const startDate = scope.startDate
      ? parseDate(scope.startDate)
      : periodObj.startDate;
    const endDate = scope.endDate
      ? parseDate(scope.endDate)
      : periodObj.endDate;

    // Step 4 — Warn if wide
    if (scope.program === undefined) {
      const months = getMonthsBetween(startDate, endDate).length;
      const estimated = programs.length * 3 * 3 * months;
      console.warn(
        `[rtu-schedule] Warning: find() without a program scope will query all programs ` +
          `in the period (~${estimated} API calls). Pass { program: 'RDBD0' } as the scope argument to narrow the search.`
      );
    }

    // Step 6 — Enumerate semesterProgramIds
    const targets: FetchTarget[] = [];

    for (const program of programs) {
      const rawCourses = await this.apiClient.findCoursesByProgram({
        semesterId: periodObj.id,
        programId: program.id,
      });

      const allCourses: StudyCourse[] = rawCourses.map((c) => ({
        id: c,
        number: c,
        name: `${c}. kurss`,
      }));

      const filteredCourses =
        scope.course !== undefined
          ? allCourses.filter((c) => c.number === scope.course)
          : allCourses;

      for (const course of filteredCourses) {
        const rawGroups = await this.apiClient.findGroupsByCourse({
          courseId: course.id,
          semesterId: periodObj.id,
          programId: program.id,
        });

        if (rawGroups.length === 0) {
          targets.push({
            semesterProgramId: course.id,
            program,
            course,
            group: undefined,
          });
          continue;
        }

        const allGroups: StudyGroup[] = rawGroups.map((g) => ({
          id: g.semesterProgramId,
          number:
            parseInt(g.group?.match(/(\d+)/)?.[1] ?? '0', 10) || 0,
          name: g.group,
          studentCount: 0,
          semesterProgramId: g.semesterProgramId,
        }));

        const filteredGroups =
          scope.group !== undefined
            ? allGroups.filter((g) => g.number === scope.group)
            : allGroups;

        for (const group of filteredGroups) {
          targets.push({
            semesterProgramId: group.semesterProgramId,
            program,
            course,
            group,
          });
        }
      }
    }

    // Step 7 — Check published (parallel, concurrency-limited)
    const concurrency = scope.concurrency ?? 5;

    const publishedResults = await withConcurrency(
      targets.map((target) => () =>
        this.apiClient.checkSemesterProgramPublished(target.semesterProgramId)
      ),
      concurrency
    );

    const publishedTargets = targets.filter(
      (_, i) =>
        publishedResults[i]?.status === 'fulfilled' &&
        (publishedResults[i] as PromiseFulfilledResult<boolean>).value === true
    );

    // Step 8 — Fetch events (parallel, concurrency-limited)
    const months = getMonthsBetween(startDate, endDate);
    const errors: QueryError[] = [];
    const allEntries: ReturnType<typeof transformToScheduleEntry>[] = [];

    const fetchTasks = publishedTargets.flatMap((target) =>
      months.map(
        ({ year, month }) =>
          () =>
            this.apiClient
              .fetchSemesterProgramEvents({
                semesterProgramId: target.semesterProgramId,
                year,
                month,
              })
              .then((events) => ({ target, events }))
      )
    );

    const fetchResults = await withConcurrency(fetchTasks, concurrency);

    for (const result of fetchResults) {
      if (result.status === 'fulfilled') {
        const { target, events } = result.value;
        for (const event of events) {
          const entry = transformToScheduleEntry(event);
          entry._source = {
            program: target.program,
            course: target.course,
            group: target.group,
          };
          allEntries.push(entry);
        }
      } else {
        // Find which target this failure belongs to by matching the rejection context
        // Since tasks are ordered by target then month, we reconstruct the target
        const taskIndex = fetchResults.indexOf(result);
        const targetIndex = Math.floor(taskIndex / months.length);
        const target = publishedTargets[targetIndex];
        if (target) {
          const cause =
            result.reason instanceof Error ? result.reason : undefined;
          const queryError: QueryError = {
            source: {
              program: target.program,
              course: target.course,
              group: target.group,
            },
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            ...(cause !== undefined && { cause }),
          };
          errors.push(queryError);
        }
      }
    }

    // Step 9 — Deduplicate by eventDateId (entry.id)
    const seen = new Set<number>();
    const deduped: typeof allEntries = [];
    for (const entry of allEntries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        deduped.push(entry);
      }
    }

    // Step 10 — Apply filter and return
    const siftFilter = sift(filter);
    const filtered = deduped.filter(
      siftFilter as (entry: (typeof deduped)[0]) => boolean
    );
    filtered.sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime()
    );

    return new QueryResult(
      filtered,
      targets.map((t) => ({
        program: t.program,
        course: t.course,
        group: t.group,
      })),
      errors.length > 0,
      errors,
      new Date()
    );
  }
}
