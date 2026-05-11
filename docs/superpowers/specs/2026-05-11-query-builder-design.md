# Query Builder Design

## Overview

Add `rtu.find(filter, scope?)` — a unified search API that fans out across multiple groups/programs to answer queries the existing `getSchedule()` cannot: finding all lectures by a lecturer, all exams across a program, etc.

The filter uses MongoDB query syntax (via sift) applied to `ScheduleEntry` fields. The scope optionally narrows which groups to fetch from. Both are independent — filter describes what you want, scope describes where to look.

---

## API Surface

```typescript
rtu.find(filter: SiftQuery<ScheduleEntry>, scope?: QueryScope): Promise<QueryResult>
```

### QueryScope

```typescript
interface QueryScope {
  period?: number | string    // defaults to current period
  program?: number | string   // defaults to all programs (triggers wide fan-out warning)
  course?: number             // defaults to all courses within program(s)
  group?: number              // defaults to all groups within course(s)
  startDate?: Date | string   // defaults to period.startDate
  endDate?: Date | string     // defaults to period.endDate
  concurrency?: number        // max parallel requests, default 5
}
```

### Filter

Standard sift operators on `ScheduleEntry` fields:
- `$or`, `$and`, `$not`, `$nor`
- `$in`, `$nin`
- `$eq`, `$ne`
- `$gt`, `$gte`, `$lt`, `$lte`
- `$regex`
- `$exists`

> **Note on lecturer matching:** sift's `$regex` matches against the scalar `lecturer` field only, not the `lecturers[]` array. For robust lecturer matching across both, use `filterByLecturer()` on the returned `QueryResult` instead of `{ lecturer: { $regex: /.../ } }` in the filter.

### Examples

```typescript
// All exams, current period, all programs
await rtu.find({ type: 'exam' })

// Lecturer search, current period
await rtu.find({ lecturer: { $regex: /Bērziņš/i } })

// Specific week range
await rtu.find({ weekNumber: { $gte: 10, $lte: 15 } })

// Narrow scope
await rtu.find(
  { $or: [{ type: 'lecture' }, { type: 'exam' }] },
  { period: '25/26-R', program: 'RDBD0' }
)

// Single group (no fan-out)
await rtu.find(
  { type: { $in: ['exam', 'test'] } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)
```

---

## Fan-out Pipeline

When `find()` is called:

1. **Resolve period** — resolve from scope or discover current period
2. **Resolve programs** — resolve from scope or discover all programs for period
3. **Warn if wide** — if no program in scope, emit `console.warn` with estimated call count
4. **Enumerate semesterProgramIds** — for each program → fetch courses → fetch groups → collect `semesterProgramId` values. Fall back to course-level ID if a course has no groups.
5. **Check published** — call `isSemesterProgramPublished` for each ID in parallel (concurrency-limited). Skip unpublished silently.
6. **Fetch events** — for each published ID, fetch all months in date range in parallel (concurrency-limited). Catch per-request failures individually.
7. **Deduplicate** — by `eventDateId` across all fetched events.
8. **Tag entries** — inject `_source: { program, course, group }` into each `ScheduleEntry` at transform time, since the RTU API returns no group identity in event payloads.
9. **Apply filter** — run sift against all collected entries.
10. **Return QueryResult** — with `partial: true` if any fetches failed.

---

## Error Handling

### User-facing errors (thrown)

| Scenario | Error class |
|---|---|
| Period not found | `PeriodNotFoundError` |
| Program not found | `ProgramNotFoundError` |
| Course not found | `CourseNotFoundError` |
| Group not found | `GroupNotFoundError` |
| Discovery fails entirely | `DiscoveryError` |
| Invalid filter (bad sift query) | `InvalidQueryError` (new) |
| No scope and no period discoverable | `DiscoveryError` |

### Partial failures (non-throwing)

Individual group fetches that fail are caught, logged to `console.warn` with the affected group info, and excluded from results. The returned `QueryResult` has `partial: true` and `errors: QueryError[]` listing what failed and why.

```typescript
interface QueryError {
  source: QuerySource
  message: string
  cause?: Error
}
```

### Wide fan-out warning

When no program is specified:

```
[rtu-schedule] Warning: find() without a program scope will query all programs 
in the period (~N API calls). Pass { program: 'RDBD0' } as the scope argument to narrow the search.
```

---

## QueryResult

```typescript
class QueryResult implements Iterable<ScheduleEntry> {
  readonly entries: ScheduleEntry[]
  readonly sources: QuerySource[]     // all program/course/groups searched
  readonly partial: boolean           // true if any individual fetches failed
  readonly errors: QueryError[]       // details on what failed
  readonly fetchedAt: Date

  // Filtering — returns new QueryResult
  filter(predicate: (entry: ScheduleEntry) => boolean): QueryResult
  filterByType(type: ScheduleEntryType | ScheduleEntryType[]): QueryResult
  filterByLecturer(name: string): QueryResult
  filterBySubject(nameOrCode: string): QueryResult
  filterByLocation(location: string): QueryResult
  filterByGroup(group: string): QueryResult
  filterByDate(date: Date): QueryResult
  filterByDateRange(from: Date, to: Date): QueryResult
  filterByDayOfWeek(day: number | number[]): QueryResult

  // Convenience
  getToday(): QueryResult
  getTomorrow(): QueryResult
  getThisWeek(): QueryResult
  getNextWeek(): QueryResult
  getUpcoming(days?: number): QueryResult
  getWeek(weekNumber: number): QueryResult
  getCurrentWeek(): QueryResult

  // Grouping
  groupByWeek(): Map<number, ScheduleEntry[]>
  groupByDate(): Map<string, ScheduleEntry[]>
  groupByDayOfWeek(): Map<number, ScheduleEntry[]>
  groupBySubject(): Map<string, ScheduleEntry[]>
  groupByLecturer(): Map<string, ScheduleEntry[]>
  groupByType(): Map<ScheduleEntryType, ScheduleEntry[]>
  groupBySource(): Map<string, ScheduleEntry[]>   // key: "${program.code}-${course.number}-${group?.name ?? 'all'}"

  // Aggregations
  getLecturers(): string[]
  getSubjects(): Array<{ name: string; code: string }>
  getLocations(): string[]
  getTypes(): ScheduleEntryType[]
  getSources(): QuerySource[]

  // Sorting & utility
  sorted(direction?: 'asc' | 'desc'): QueryResult
  toArray(): ScheduleEntry[]
  toSchedule(metadata: ScheduleMetadata): Schedule  // convert back if single-source
  get count(): number
  get isEmpty(): boolean
  get first(): ScheduleEntry | undefined
  get last(): ScheduleEntry | undefined
  [Symbol.iterator](): Iterator<ScheduleEntry>
}

interface QuerySource {
  program: StudyProgram
  course: StudyCourse
  group: StudyGroup | undefined
}
```

### ScheduleEntry extension

One new optional field, backward compatible:

```typescript
interface ScheduleEntry {
  // ... existing fields ...
  _source?: QuerySource   // set when fetched via find(), undefined via getSchedule()
}
```

---

## New Error Class

```typescript
class InvalidQueryError extends RTUScheduleError {
  constructor(message: string) {
    super(`Invalid query: ${message}`)
  }
}
```

---

## Tests

Tests hit the **real production API** at `nodarbibas.rtu.lv`. No mocks for the network layer.

### Coverage required

**Fan-out correctness**
- Single group scope returns correct entries with `_source` tagged
- Course-level scope (no group) fans out to all groups in that course
- Program-level scope fans out across all courses and groups
- Full period scope (no program) fans out across all programs, emits warning
- Date range scoping limits fetch and returned entries correctly
- Deduplication: same `eventDateId` from multiple months appears once

**Filter correctness**
- `{ type: 'exam' }` returns only exam entries
- `{ lecturer: { $regex: /name/i } }` matches across `lecturer` and `lecturers[]`
- `{ weekNumber: { $gte: 10, $lte: 15 } }` returns entries in week range
- `{ $or: [{ type: 'lecture' }, { type: 'exam' }] }` returns union
- `{ $and: [{ type: 'lecture' }, { dayOfWeek: 1 }] }` returns intersection
- Empty filter `{}` returns all entries
- Filter matching nothing returns empty `QueryResult` with `isEmpty: true`

**Scope resolution**
- No scope → defaults to current period, all programs
- `period` by code string resolves correctly
- `period` by numeric ID resolves correctly
- Invalid period throws `PeriodNotFoundError`
- Invalid program throws `ProgramNotFoundError`
- Invalid course throws `CourseNotFoundError`
- Invalid group throws `GroupNotFoundError`

**Published check**
- Unpublished `semesterProgramId` is skipped silently
- All unpublished → empty result with `partial: false` (not an error, just no data)

**Partial failures** *(unit tests — simulate failure by injecting a mock `apiClient` that throws on one `semesterProgramId`)*
- Network failure on one group → `partial: true`, `errors[]` populated, other results returned
- All fetches fail → `partial: true`, empty entries, all errors in `errors[]`

**QueryResult API**
- All filter methods return new `QueryResult` with correct subset
- `groupBySource()` correctly keys by program+course+group
- `sorted()` orders by `startDateTime`
- `partial` and `errors` preserved through filter/sort operations
- `toSchedule()` throws if more than one source

**Edge cases from real API**
- `eventTempName` with multiple prefixes parses subject correctly
- `lecturerInfoText` with semicolon separator splits correctly
- `programInfoText` being `null` doesn't crash
- `eventDate` timestamp produces correct Latvia-local date
- `customStart`/`customEnd` with `second: 0, nano: 0` produces correct times
- Course with no groups falls back to course-level `semesterProgramId`
- Program with no courses in period is skipped gracefully
- Very large fan-out (full period) completes without hanging (concurrency limit enforced)
- Concurrency limit of 1 works correctly (sequential execution)

---

## Concurrency Control

Simple promise pool — no external dependency:

```typescript
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]>
```

Uses `Promise.allSettled` semantics — all tasks run, failures don't cancel others.

---

## New Dependency

Add `sift` as a production dependency — battle-tested MongoDB query engine for in-memory JavaScript arrays (~7kb minified).

---

## Files to Create / Modify

| File | Change |
|---|---|
| `src/schedule/query-builder.ts` | New — `ScheduleQuery` class (internal pipeline) |
| `src/schedule/query-result.ts` | New — `QueryResult` class |
| `src/schedule/errors.ts` | Add `InvalidQueryError` |
| `src/schedule/types.ts` | Add `QueryScope`, `QuerySource`, `QueryError`; extend `ScheduleEntry` with `_source?` |
| `src/schedule/rtu-schedule.ts` | Add `find()` method |
| `src/schedule/index.ts` | Export new types and classes |
| `src/index.ts` | Re-export new public surface |
| `tests/query-builder.test.ts` | New — all test cases above against real API |
