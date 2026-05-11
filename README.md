<h1 align="center">
  <br />
  <a href="https://www.rtu.lv">
    <img height="220" src="https://www.rtu.lv/download/rtu_logo_en.jpg" alt="RTU" style="border-radius: 20px;" />
  </a>
</h1>

<h2 align="center">RTU Schedule API</h2>

<p align="center">
  <em>Created by an RTU student who discovered that even a great university can lack a public API for schedules.<br />This library bridges that gap, making RTU schedule data accessible to everyone.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rtu-schedule-unofficial-client">
    <img src="https://img.shields.io/npm/v/rtu-schedule-unofficial-client.svg" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/rtu-schedule-unofficial-client">
    <img src="https://img.shields.io/npm/dm/rtu-schedule-unofficial-client.svg" alt="npm downloads" />
  </a>
  <img src="https://img.shields.io/badge/lang-en-blue.svg" alt="English" />
  <a href="README.lv.md">
    <img src="https://img.shields.io/badge/lang-lv-red.svg" alt="Latviešu" />
  </a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#get-a-schedule">Get a Schedule</a> •
  <a href="#search-across-groups">Search</a> •
  <a href="#working-with-results">Results</a> •
  <a href="#examples">Examples</a>
</p>

## Installation

```bash
npm install rtu-schedule-unofficial-client
```

## Get a Schedule

Fetch the schedule for a specific group. Period, program, course, and group are resolved automatically from human-readable strings — no IDs needed.

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

const schedule = await rtu.getSchedule({
  period: '25/26-R',   // semester code, name, or numeric ID — defaults to current
  program: 'RDBD0',    // program code, name, or numeric ID
  course: 1,           // year of study
  group: 13,           // group number (optional — omit for all groups in course)

  // Date range (optional — defaults to full semester)
  startDate: '2025-09-01',
  endDate: '2025-12-31'
});

console.log(schedule.count);
const lectures = schedule.filterByType('lecture');
const thisWeek = schedule.getThisWeek();
```

## Search Across Groups

`find()` fans out across multiple groups, courses, or programs — answering questions `getSchedule()` cannot: all lectures by a lecturer, all exams in a program, etc.

```typescript
// All exams in the current semester, all programs
await rtu.find({ type: 'exam' })

// All lectures by a specific lecturer, narrowed to one program
await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R', program: 'RDBD0' }
)

// Lectures by lecturer OR any exam
await rtu.find(
  { $or: [
    { type: 'lecture', lecturer: { $regex: /Bērziņš/i } },
    { type: 'exam' }
  ]},
  { period: '25/26-R', program: 'RDBD0' }
)

// Entries in a specific week range
await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)
```

### Scope

```typescript
interface QueryScope {
  period?: number | string    // defaults to current period
  program?: number | string   // defaults to all programs (many API calls — narrow when possible)
  course?: number             // defaults to all courses
  group?: number              // defaults to all groups
  startDate?: Date | string   // defaults to period start
  endDate?: Date | string     // defaults to period end
  concurrency?: number        // max parallel requests, default 5
}
```

### Filter Operators

The filter uses [MongoDB query syntax](https://github.com/crcn/sift.js) on `ScheduleEntry` fields:

| Operator | Example |
|---|---|
| `$eq` | `{ type: 'exam' }` |
| `$ne` | `{ type: { $ne: 'lab' } }` |
| `$in` | `{ type: { $in: ['exam', 'test'] } }` |
| `$nin` | `{ type: { $nin: ['lab', 'practical'] } }` |
| `$gt` / `$gte` | `{ weekNumber: { $gte: 10 } }` |
| `$lt` / `$lte` | `{ durationMinutes: { $lte: 90 } }` |
| `$regex` | `{ lecturer: { $regex: /Smith/i } }` |
| `$exists` | `{ building: { $exists: true } }` |
| `$and` | `{ $and: [{ type: 'lecture' }, { dayOfWeek: 1 }] }` |
| `$or` | `{ $or: [{ type: 'exam' }, { type: 'test' }] }` |
| `$not` | `{ $not: { type: 'lab' } }` |

> **Lecturer tip:** `$regex` matches only the scalar `lecturer` field. For robust matching across `lecturers[]` too, chain `.filterByLecturer()` on the result.

## Working with Results

Both `getSchedule()` and `find()` return a result object with the same filtering, grouping, and convenience API. `find()` returns `QueryResult` which additionally carries multi-source metadata.

### Filtering

All filter methods return a new result object:

```typescript
result.filter(e => e.durationMinutes > 60)
result.filterByType('lecture')
result.filterByType(['lecture', 'lab'])
result.filterByDateRange(from, to)
result.filterByDate(date)
result.filterByLecturer('Smith')
result.filterBySubject('Programming')
result.filterByLocation('Building A')
result.filterByDayOfWeek(1)              // 1=Monday … 7=Sunday
```

**Types:** `lecture` | `practical` | `lab` | `seminar` | `consultation` | `exam` | `test` | `other`

### Grouping

```typescript
result.groupByWeek()       // Map<weekNumber, ScheduleEntry[]>
result.groupByDate()       // Map<'YYYY-MM-DD', ScheduleEntry[]>
result.groupByDayOfWeek()  // Map<1-7, ScheduleEntry[]>
result.groupBySubject()    // Map<subjectCode, ScheduleEntry[]>
result.groupByLecturer()   // Map<name, ScheduleEntry[]>
result.groupByType()       // Map<type, ScheduleEntry[]>
```

### Convenience

```typescript
result.getToday()
result.getTomorrow()
result.getThisWeek()
result.getNextWeek()
result.getUpcoming(7)      // next N days
result.getWeek(36)
result.getCurrentWeek()
```

### Aggregation & Properties

```typescript
result.getLecturers()      // string[]
result.getSubjects()       // { name, code }[]
result.getLocations()      // string[]
result.getTypes()          // ScheduleEntryType[]

result.count
result.isEmpty
result.first
result.last
result.entries             // ScheduleEntry[]
result.sorted('asc')
result.toArray()

for (const entry of result) { ... }
[...result]
```

### QueryResult extras (find() only)

```typescript
result.partial             // true if some group fetches failed
result.errors              // QueryError[] — what failed and why
result.sources             // QuerySource[] — which groups were searched
result.groupBySource()     // Map keyed by "program-course-group"
result.getSources()        // QuerySource[]
```

Each entry has `_source` identifying where it came from:

```typescript
entry._source?.program.code   // e.g. 'RDBD0'
entry._source?.group?.name    // e.g. '13. grupa'
```

## ScheduleEntry

```typescript
interface ScheduleEntry {
  id: number;
  subject: { name: string; code: string };

  date: Date;
  startTime: string;         // "09:00"
  endTime: string;           // "10:30"
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;

  location: string;          // "Building A-423"
  building?: string;
  room?: string;

  lecturer: string;
  lecturers: string[];

  type: ScheduleEntryType;
  typeRaw: string;

  group: string;
  groups: string[];

  weekNumber: number;
  dayOfWeek: number;         // 1-7 (Mon-Sun)
  dayName: string;

  _source?: QuerySource;     // set when fetched via find()
}
```

## Error Handling

```typescript
import {
  PeriodNotFoundError,
  ProgramNotFoundError,
  CourseNotFoundError,
  GroupNotFoundError,
  InvalidOptionsError,   // bad options passed to getSchedule()
  InvalidQueryError,     // bad filter passed to find()
  DiscoveryError
} from 'rtu-schedule-unofficial-client';

try {
  const result = await rtu.find({ type: 'exam' }, { period: 'bad' });
} catch (error) {
  if (error instanceof PeriodNotFoundError) {
    console.error(`Period not found: ${error.input}`);
  }
}
```

## Configuration

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,
  cacheTimeout: 300000,           // API cache, default 5 min
  discoveryCacheTimeout: 3600000  // discovery cache, default 1h
});

rtu.clearCache();
rtu.refresh();
```

## TypeScript

```typescript
import type {
  ScheduleEntry, ScheduleEntryType,
  QueryScope, QuerySource, QueryError,
  StudyPeriod, StudyProgram, StudyCourse, StudyGroup,
  GetScheduleOptions
} from 'rtu-schedule-unofficial-client';
```

## Examples

### Get this week's lectures

```typescript
const rtu = new RTUSchedule();

const schedule = await rtu.getSchedule({
  period: '25/26-R',
  program: 'RDBD0',
  course: 1,
  group: 13
});

const lectures = schedule.filterByType('lecture').getThisWeek();
console.log(`${lectures.count} lectures this week`);

for (const entry of lectures) {
  console.log(`${entry.dayName} ${entry.startTime} — ${entry.subject.name}`);
}
```

### Find all exams in a program

```typescript
const results = await rtu.find(
  { type: { $in: ['exam', 'test'] } },
  { period: '25/26-R', program: 'RDBD0' }
);

console.log(`Found ${results.count} exams across ${results.sources.length} groups`);

const byWeek = results.groupByWeek();
for (const [week, entries] of byWeek) {
  console.log(`Week ${week}: ${entries.length} exams`);
}
```

### Find a lecturer's full schedule

```typescript
const results = await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R' }
);

results.filterByLecturer('Bērziņš').groupByDate().forEach((entries, date) => {
  console.log(`${date}: ${entries.length} classes`);
});
```
