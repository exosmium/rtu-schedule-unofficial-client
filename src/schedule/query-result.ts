import type {
  QueryError,
  QuerySource,
  ScheduleEntry,
  ScheduleEntryType,
  ScheduleMetadata,
} from './types.js';
import { Schedule } from './schedule-result.js';
import {
  formatDate,
  fuzzyMatch,
  getWeekEnd,
  getWeekNumber,
  getWeekStart,
  isSameDay,
} from './utils.js';

export class QueryResult implements Iterable<ScheduleEntry> {
  readonly entries: ScheduleEntry[];
  readonly sources: QuerySource[];
  readonly partial: boolean;
  readonly errors: QueryError[];
  readonly fetchedAt: Date;

  constructor(
    entries: ScheduleEntry[],
    sources: QuerySource[],
    partial: boolean,
    errors: QueryError[],
    fetchedAt?: Date
  ) {
    this.entries = entries;
    this.sources = sources;
    this.partial = partial;
    this.errors = errors;
    this.fetchedAt = fetchedAt ?? new Date();
  }

  // ========== FILTERING METHODS ==========

  filter(predicate: (entry: ScheduleEntry) => boolean): QueryResult {
    return this.createFiltered(this.entries.filter(predicate));
  }

  filterByType(type: ScheduleEntryType | ScheduleEntryType[]): QueryResult {
    const types = Array.isArray(type) ? type : [type];
    return this.filter((e) => types.includes(e.type));
  }

  filterByDateRange(from: Date, to: Date): QueryResult {
    const fromTime = from.getTime();
    const toTime = to.getTime();
    return this.filter((e) => {
      const entryTime = e.date.getTime();
      return entryTime >= fromTime && entryTime <= toTime;
    });
  }

  filterByDate(date: Date): QueryResult {
    return this.filter((e) => isSameDay(e.date, date));
  }

  filterByLecturer(name: string): QueryResult {
    return this.filter(
      (e) =>
        fuzzyMatch(name, e.lecturer) ||
        e.lecturers.some((l) => fuzzyMatch(name, l))
    );
  }

  filterBySubject(nameOrCode: string): QueryResult {
    return this.filter(
      (e) =>
        fuzzyMatch(nameOrCode, e.subject.name) ||
        fuzzyMatch(nameOrCode, e.subject.code)
    );
  }

  filterByLocation(location: string): QueryResult {
    return this.filter(
      (e) =>
        fuzzyMatch(location, e.location) ||
        (e.building !== undefined && fuzzyMatch(location, e.building)) ||
        (e.room !== undefined && fuzzyMatch(location, e.room))
    );
  }

  filterByGroup(group: string): QueryResult {
    return this.filter(
      (e) =>
        fuzzyMatch(group, e.group) || e.groups.some((g) => fuzzyMatch(group, g))
    );
  }

  filterByDayOfWeek(day: number | number[]): QueryResult {
    const days = Array.isArray(day) ? day : [day];
    return this.filter((e) => days.includes(e.dayOfWeek));
  }

  // ========== GROUPING METHODS ==========

  groupByWeek(): Map<number, ScheduleEntry[]> {
    return this.groupBy((e) => e.weekNumber);
  }

  groupByDate(): Map<string, ScheduleEntry[]> {
    return this.groupBy((e) => formatDate(e.date));
  }

  groupByDayOfWeek(): Map<number, ScheduleEntry[]> {
    return this.groupBy((e) => e.dayOfWeek);
  }

  groupBySubject(): Map<string, ScheduleEntry[]> {
    return this.groupBy((e) => e.subject.code || e.subject.name);
  }

  groupByLecturer(): Map<string, ScheduleEntry[]> {
    return this.groupBy((e) => e.lecturer);
  }

  groupByType(): Map<ScheduleEntryType, ScheduleEntry[]> {
    return this.groupBy((e) => e.type);
  }

  groupBySource(): Map<string, ScheduleEntry[]> {
    return this.groupBy(
      (e) =>
        `${e._source?.program.code ?? 'unknown'}-${e._source?.course.number ?? 0}-${e._source?.group?.name ?? 'all'}`
    );
  }

  // ========== CONVENIENCE METHODS ==========

  getToday(): QueryResult {
    return this.filterByDate(new Date());
  }

  getTomorrow(): QueryResult {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.filterByDate(tomorrow);
  }

  getThisWeek(): QueryResult {
    const now = new Date();
    return this.filterByDateRange(getWeekStart(now), getWeekEnd(now));
  }

  getNextWeek(): QueryResult {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return this.filterByDateRange(getWeekStart(nextWeek), getWeekEnd(nextWeek));
  }

  getUpcoming(days: number = 7): QueryResult {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    end.setHours(23, 59, 59, 999);
    return this.filterByDateRange(now, end);
  }

  getWeek(weekNumber: number): QueryResult {
    return this.filter((e) => e.weekNumber === weekNumber);
  }

  getCurrentWeek(): QueryResult {
    const currentWeek = getWeekNumber(new Date());
    return this.getWeek(currentWeek);
  }

  // ========== AGGREGATION METHODS ==========

  getLecturers(): string[] {
    const lecturers = new Set<string>();
    for (const entry of this.entries) {
      if (entry.lecturer) lecturers.add(entry.lecturer);
      for (const l of entry.lecturers) {
        if (l) lecturers.add(l);
      }
    }
    return Array.from(lecturers).sort();
  }

  getSubjects(): Array<{ name: string; code: string }> {
    const subjects = new Map<string, { name: string; code: string }>();
    for (const entry of this.entries) {
      const key = entry.subject.code || entry.subject.name;
      if (!subjects.has(key)) {
        subjects.set(key, { ...entry.subject });
      }
    }
    return Array.from(subjects.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getLocations(): string[] {
    const locations = new Set<string>();
    for (const entry of this.entries) {
      if (entry.location) locations.add(entry.location);
    }
    return Array.from(locations).sort();
  }

  getTypes(): ScheduleEntryType[] {
    const types = new Set<ScheduleEntryType>();
    for (const entry of this.entries) {
      types.add(entry.type);
    }
    return Array.from(types);
  }

  getSources(): QuerySource[] {
    return [...this.sources];
  }

  // ========== UTILITY PROPERTIES & METHODS ==========

  get count(): number {
    return this.entries.length;
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  get first(): ScheduleEntry | undefined {
    return this.entries[0];
  }

  get last(): ScheduleEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  sorted(direction: 'asc' | 'desc' = 'asc'): QueryResult {
    const sorted = [...this.entries].sort((a, b) => {
      const diff = a.startDateTime.getTime() - b.startDateTime.getTime();
      return direction === 'asc' ? diff : -diff;
    });
    return this.createFiltered(sorted);
  }

  toArray(): ScheduleEntry[] {
    return [...this.entries];
  }

  toSchedule(metadata: ScheduleMetadata): Schedule {
    if (this.sources.length !== 1) {
      throw new Error(
        `Cannot convert multi-source QueryResult to Schedule: ${this.sources.length} sources`
      );
    }
    return new Schedule(this.entries, metadata);
  }

  [Symbol.iterator](): Iterator<ScheduleEntry> {
    return this.entries[Symbol.iterator]();
  }

  // ========== PRIVATE METHODS ==========

  private createFiltered(entries: ScheduleEntry[]): QueryResult {
    return new QueryResult(
      entries,
      this.sources,
      this.partial,
      this.errors,
      this.fetchedAt
    );
  }

  private groupBy<K>(
    keyFn: (entry: ScheduleEntry) => K
  ): Map<K, ScheduleEntry[]> {
    const map = new Map<K, ScheduleEntry[]>();
    for (const entry of this.entries) {
      const key = keyFn(entry);
      const group = map.get(key);
      if (group) {
        group.push(entry);
      } else {
        map.set(key, [entry]);
      }
    }
    return map;
  }
}
