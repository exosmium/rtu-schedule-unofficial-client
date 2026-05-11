import sift from 'sift';
import { RTUApiClient } from '../api-client.js';
import { DiscoveryService } from './discovery.js';
import { InvalidQueryError, PeriodNotFoundError } from './errors.js';
import { QueryResult } from './query-result.js';
import { Resolver } from './resolver.js';
import type {
  QueryError,
  QueryScope,
  QuerySource,
  ScheduleEntry,
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
  if (limit <= 0) {
    throw new Error(
      `withConcurrency: limit must be a positive integer, got ${limit}`
    );
  }
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= tasks.length) return;
    try {
      results[index] = { status: 'fulfilled', value: await tasks[index]!() };
    } catch (err) {
      results[index] = { status: 'rejected', reason: err };
    }
    await runNext();
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext()
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
    try {
      sift(filter);
    } catch (err) {
      throw new InvalidQueryError(
        `The filter object is not a valid sift query: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const { targets, startDate, endDate } = await this.resolveTargets(scope);
    const months = getMonthsBetween(startDate, endDate);
    const sources: QuerySource[] = targets.map((t) => ({
      program: t.program,
      course: t.course,
      group: t.group,
    }));

    if (months.length === 0) {
      return new QueryResult([], sources, false, [], new Date());
    }

    const concurrency = scope.concurrency ?? 5;
    const { entries, errors } = await this.fetchAndTag(
      targets,
      months,
      concurrency
    );

    const seen = new Set<number>();
    const deduped: ScheduleEntry[] = [];
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        deduped.push(entry);
      }
    }

    const siftFilter = sift(filter);
    const filtered = deduped.filter(
      siftFilter as (entry: ScheduleEntry) => boolean
    );
    filtered.sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime()
    );

    return new QueryResult(
      filtered,
      sources,
      errors.length > 0,
      errors,
      new Date()
    );
  }

  private async resolveTargets(scope: QueryScope): Promise<{
    targets: FetchTarget[];
    startDate: Date;
    endDate: Date;
  }> {
    const periodObj =
      scope.period !== undefined
        ? await this.resolver.resolvePeriod(scope.period)
        : await this.discoveryService.discoverCurrentPeriod();
    if (periodObj === null) throw new PeriodNotFoundError('current');

    const programs =
      scope.program !== undefined
        ? [await this.resolver.resolveProgram(scope.program, periodObj.id)]
        : await this.discoveryService.discoverPrograms(periodObj.id);

    const startDate =
      scope.startDate !== undefined
        ? parseDate(scope.startDate)
        : periodObj.startDate;
    const endDate =
      scope.endDate !== undefined
        ? parseDate(scope.endDate)
        : periodObj.endDate;

    if (scope.program === undefined) {
      const monthCount = getMonthsBetween(startDate, endDate).length;
      const estimated = programs.length * 3 * 3 * monthCount;
      console.warn(
        `[rtu-schedule] Warning: find() without a program scope will query all programs ` +
          `in the period (~${estimated} API calls). Pass { program: 'RDBD0' } as the scope argument to narrow the search.`
      );
    }

    const targets = await this.enumerateTargets(scope, periodObj.id, programs);
    return { targets, startDate, endDate };
  }

  private async enumerateTargets(
    scope: QueryScope,
    periodId: number,
    programs: StudyProgram[]
  ): Promise<FetchTarget[]> {
    const targets: FetchTarget[] = [];

    for (const program of programs) {
      const rawCourses = await this.apiClient.findCoursesByProgram({
        semesterId: periodId,
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
          semesterId: periodId,
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
          number: parseInt(g.group?.match(/(\d+)/)?.[1] ?? '0', 10) || 0,
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

    return targets;
  }

  private async fetchAndTag(
    targets: FetchTarget[],
    months: { year: number; month: number }[],
    concurrency: number
  ): Promise<{ entries: ScheduleEntry[]; errors: QueryError[] }> {
    const publishedResults = await withConcurrency(
      targets.map(
        (target) => () =>
          this.apiClient.checkSemesterProgramPublished(target.semesterProgramId)
      ),
      concurrency
    );

    const publishedTargets = targets.filter((_, i) => {
      const r = publishedResults[i];
      return r?.status === 'fulfilled' && r.value === true;
    });

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

    const entries: ScheduleEntry[] = [];
    const errors: QueryError[] = [];

    fetchResults.forEach((result, taskIndex) => {
      if (result.status === 'fulfilled') {
        const { target, events } = result.value;
        for (const event of events) {
          const entry = transformToScheduleEntry(event);
          entry._source = {
            program: target.program,
            course: target.course,
            group: target.group,
          };
          entries.push(entry);
        }
      } else {
        const targetIndex = Math.floor(taskIndex / months.length);
        const target = publishedTargets[targetIndex];
        if (target !== undefined) {
          const cause =
            result.reason instanceof Error ? result.reason : undefined;
          errors.push({
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
          });
        }
      }
    });

    return { entries, errors };
  }
}
