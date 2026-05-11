import { RTUApiClient } from '../api-client.js';
import { RTUHtmlParser } from '../html-parser.js';
import type { SemesterEvent } from '../types.js';
import type {
  GetScheduleOptions,
  QueryScope,
  RTUScheduleConfig,
  ScheduleEntry,
  StudyCourse,
  StudyGroup,
  StudyPeriod,
  StudyProgram,
} from './types.js';
import { Schedule } from './schedule-result.js';
import { QueryResult } from './query-result.js';
import { ScheduleQuery } from './query-builder.js';
import { DiscoveryService } from './discovery.js';
import { Resolver } from './resolver.js';
import { InvalidOptionsError, PeriodNotFoundError } from './errors.js';
import {
  getMonthsBetween,
  parseDate,
  transformToScheduleEntry,
} from './utils.js';

const DEFAULT_CONFIG: Required<RTUScheduleConfig> = {
  baseUrl: 'https://nodarbibas.rtu.lv',
  timeout: 10000,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.118 Safari/537.36',
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  discoveryCacheTimeout: 60 * 60 * 1000, // 1 hour
  autoDiscover: true,
};

/**
 * Main RTUSchedule facade - user-friendly API for RTU schedule access
 *
 * @example
 * ```typescript
 * const rtu = new RTUSchedule();
 *
 * // Get schedule with human-readable selection
 * const schedule = await rtu.getSchedule({
 *   period: '25/26-R',
 *   program: 'RDBD0',
 *   course: 1,
 *   group: 13
 * });
 *
 * // Filter and work with results
 * const lectures = schedule.filterByType('lecture');
 * const thisWeek = schedule.getThisWeek();
 * ```
 */
export class RTUSchedule {
  private apiClient: RTUApiClient;
  private htmlParser: RTUHtmlParser;
  private discoveryService: DiscoveryService;
  private resolver: Resolver;
  private config: Required<RTUScheduleConfig>;

  constructor(config?: RTUScheduleConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.apiClient = new RTUApiClient({
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      userAgent: this.config.userAgent,
      cacheTimeout: this.config.cacheTimeout,
    });

    this.htmlParser = new RTUHtmlParser();

    this.discoveryService = new DiscoveryService(this.htmlParser, {
      baseUrl: this.config.baseUrl,
      cacheTimeout: this.config.discoveryCacheTimeout,
    });

    this.resolver = new Resolver(this.discoveryService, this.apiClient);
  }

  // ========== DISCOVERY METHODS ==========

  /**
   * Get all available study periods (semesters)
   */
  async getPeriods(): Promise<StudyPeriod[]> {
    return this.discoveryService.discoverPeriods();
  }

  /**
   * Get current/default study period
   */
  async getCurrentPeriod(): Promise<StudyPeriod> {
    const current = await this.discoveryService.discoverCurrentPeriod();
    if (!current) {
      throw new PeriodNotFoundError('current');
    }
    return current;
  }

  /**
   * Get all study programs for a period
   * @param period - period ID, code, or name (defaults to current period)
   */
  async getPrograms(period?: number | string): Promise<StudyProgram[]> {
    const periodObj =
      period !== undefined
        ? await this.resolver.resolvePeriod(period)
        : await this.getCurrentPeriod();
    return this.discoveryService.discoverPrograms(periodObj.id);
  }

  /**
   * Get available courses for a program in a period
   */
  async getCourses(
    period: number | string,
    program: number | string
  ): Promise<StudyCourse[]> {
    const periodObj = await this.resolver.resolvePeriod(period);
    const programObj = await this.resolver.resolveProgram(
      program,
      periodObj.id
    );
    return this.resolver.getCourses(periodObj.id, programObj.id);
  }

  /**
   * Get available groups for a program/course in a period
   */
  async getGroups(
    period: number | string,
    program: number | string,
    course: number
  ): Promise<StudyGroup[]> {
    const periodObj = await this.resolver.resolvePeriod(period);
    const programObj = await this.resolver.resolveProgram(
      program,
      periodObj.id
    );
    const courseObj = await this.resolver.resolveCourse(
      course,
      periodObj.id,
      programObj.id
    );
    return this.resolver.getGroups(periodObj.id, programObj.id, courseObj.id);
  }

  // ========== MAIN SCHEDULE METHOD ==========

  /**
   * Get schedule with flexible selection options
   *
   * @example
   * ```typescript
   * // Using codes
   * const schedule = await rtu.getSchedule({
   *   period: '25/26-R',
   *   program: 'RDBD0',
   *   course: 1,
   *   group: 13
   * });
   *
   * // Using IDs
   * const schedule = await rtu.getSchedule({
   *   periodId: 45,
   *   programId: 123,
   *   course: 1
   * });
   *
   * // With date range
   * const schedule = await rtu.getSchedule({
   *   period: 'Rudens 2025',
   *   program: 'Datorsistēmas',
   *   course: 1,
   *   startDate: '2025-09-01',
   *   endDate: '2025-12-31'
   * });
   * ```
   */
  async getSchedule(options: GetScheduleOptions): Promise<Schedule> {
    this.validateOptions(options);

    // Resolve period
    const periodInput = options.periodId ?? options.period;
    const periodObj =
      periodInput !== undefined
        ? await this.resolver.resolvePeriod(periodInput)
        : await this.getCurrentPeriod();

    // Resolve program
    const programInput = options.programId ?? options.program;
    if (programInput === undefined) {
      throw new InvalidOptionsError('Either program or programId is required');
    }
    const programObj = await this.resolver.resolveProgram(
      programInput,
      periodObj.id
    );

    // Resolve course
    const courseObj = await this.resolver.resolveCourse(
      options.course,
      periodObj.id,
      programObj.id
    );

    // Resolve group (optional)
    let groupObj: StudyGroup | undefined;
    if (options.group !== undefined) {
      groupObj = await this.resolver.resolveGroup(
        options.group,
        periodObj.id,
        programObj.id,
        courseObj.id
      );
    }

    // Determine date range
    const startDate =
      options.startDate !== undefined
        ? parseDate(options.startDate)
        : periodObj.startDate;
    const endDate =
      options.endDate !== undefined
        ? parseDate(options.endDate)
        : periodObj.endDate;

    // Fetch events for all months in range
    const events = await this.fetchEventsForDateRange(
      groupObj?.semesterProgramId ?? courseObj.id,
      startDate,
      endDate
    );

    // Transform events to schedule entries
    const entries = events.map(transformToScheduleEntry);

    // Filter by date range
    const filteredEntries = this.filterEntriesByDateRange(
      entries,
      startDate,
      endDate
    );

    // Sort by date/time
    filteredEntries.sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime()
    );

    return new Schedule(filteredEntries, {
      period: periodObj,
      program: programObj,
      course: courseObj,
      group: groupObj,
      fetchedAt: new Date(),
    });
  }

  /**
   * Find schedule entries using a flexible query builder
   *
   * @example
   * ```typescript
   * const results = await rtu.find(
   *   { program: 'RDBD0', course: 1, group: 13 },
   *   { withConcurrency: 5 }
   * );
   * ```
   */
  async find(
    filter: Record<string, unknown> = {},
    scope: QueryScope = {}
  ): Promise<QueryResult> {
    const scheduleQuery = new ScheduleQuery(
      this.discoveryService,
      this.resolver,
      this.apiClient
    );
    return scheduleQuery.execute(filter, scope);
  }

  // ========== UTILITY METHODS ==========

  /**
   * Check if a schedule is published for given selection
   */
  async isSchedulePublished(
    period: number | string,
    program: number | string,
    course: number,
    group?: number
  ): Promise<boolean> {
    const periodObj = await this.resolver.resolvePeriod(period);
    const programObj = await this.resolver.resolveProgram(
      program,
      periodObj.id
    );
    const courseObj = await this.resolver.resolveCourse(
      course,
      periodObj.id,
      programObj.id
    );

    let semesterProgramId = courseObj.id;
    if (group !== undefined) {
      const groupObj = await this.resolver.resolveGroup(
        group,
        periodObj.id,
        programObj.id,
        courseObj.id
      );
      semesterProgramId = groupObj.semesterProgramId;
    }

    return this.apiClient.checkSemesterProgramPublished(semesterProgramId);
  }

  /**
   * Force refresh of cached discovery data
   */
  refresh(): void {
    this.discoveryService.clearCache();
    this.apiClient.clearCache();
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.discoveryService.clearCache();
    this.apiClient.clearCache();
  }

  // ========== PRIVATE METHODS ==========

  private validateOptions(options: GetScheduleOptions): void {
    if (options.course === undefined || options.course < 1) {
      throw new InvalidOptionsError('course is required and must be >= 1');
    }

    if (options.program === undefined && options.programId === undefined) {
      throw new InvalidOptionsError('Either program or programId is required');
    }
  }

  private async fetchEventsForDateRange(
    semesterProgramId: number,
    startDate: Date,
    endDate: Date
  ): Promise<SemesterEvent[]> {
    const months = getMonthsBetween(startDate, endDate);
    const allEvents: SemesterEvent[] = [];

    // Fetch events for each month
    for (const { year, month } of months) {
      try {
        const events = await this.apiClient.fetchSemesterProgramEvents({
          semesterProgramId,
          year,
          month,
        });
        allEvents.push(...events);
      } catch {
        // Continue with other months if one fails
      }
    }

    // Remove duplicates by event ID
    const uniqueEvents = new Map<number, SemesterEvent>();
    for (const event of allEvents) {
      if (!uniqueEvents.has(event.eventDateId)) {
        uniqueEvents.set(event.eventDateId, event);
      }
    }

    return Array.from(uniqueEvents.values());
  }

  private filterEntriesByDateRange(
    entries: ScheduleEntry[],
    startDate: Date,
    endDate: Date
  ): ScheduleEntry[] {
    const startTime = new Date(startDate);
    startTime.setHours(0, 0, 0, 0);

    const endTime = new Date(endDate);
    endTime.setHours(23, 59, 59, 999);

    return entries.filter((entry) => {
      const entryTime = entry.date.getTime();
      return entryTime >= startTime.getTime() && entryTime <= endTime.getTime();
    });
  }
}
