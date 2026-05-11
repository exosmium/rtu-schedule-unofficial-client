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
  <a href="#quick-start">Quick Start</a> •
  <a href="#api-methods">API</a> •
  <a href="#cross-group-search">Search</a> •
  <a href="#schedule-class">Schedule</a> •
  <a href="#examples">Examples</a>
</p>

## Installation

```bash
npm install rtu-schedule-unofficial-client
```

## Quick Start

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

// Get available periods, programs, courses, groups
const periods = await rtu.getPeriods();
const programs = await rtu.getPrograms('25/26-R');
const courses = await rtu.getCourses('25/26-R', 'RDBD0');
const groups = await rtu.getGroups('25/26-R', 'RDBD0', 1);

// Get schedule
const schedule = await rtu.getSchedule({
  period: '25/26-R',      // Autumn 2025/2026
  program: 'RDBD0',       // Computer Systems
  course: 1,              // 1st year
  group: 13               // Group 13 (optional)
});

// Work with results
console.log(schedule.count);                        // Entry count
const lectures = schedule.filterByType('lecture');  // Only lectures
const thisWeek = schedule.getThisWeek();            // This week's schedule
const byDay = schedule.groupByDate();               // Group by date
```

## API Methods

### Discovery

```typescript
// All available semesters
const periods = await rtu.getPeriods();
// → [{ id, name, code, season, startDate, endDate, isSelected }, ...]

// Current semester
const current = await rtu.getCurrentPeriod();

// Programs for a semester (by ID, code, or name)
const programs = await rtu.getPrograms('25/26-R');
const programs = await rtu.getPrograms(45);
const programs = await rtu.getPrograms('Autumn 2025');

// Courses and groups
const courses = await rtu.getCourses('25/26-R', 'RDBD0');
const groups = await rtu.getGroups('25/26-R', 'RDBD0', 1);
```

### Getting Schedule

```typescript
const schedule = await rtu.getSchedule({
  // Period - code, name, or ID
  period: '25/26-R',        // or: 'Autumn 2025', periodId: 45

  // Program - code, name, or ID
  program: 'RDBD0',         // or: 'Computer Systems', programId: 123

  // Course (required)
  course: 1,

  // Group (optional - without it returns all groups)
  group: 13,

  // Date range (optional - defaults to semester dates)
  startDate: '2025-09-01',
  endDate: '2025-12-31'
});
```

## Cross-group Search

`getSchedule()` fetches data for one group. `find()` fans out across multiple groups, courses, or programs to answer questions the single-group API cannot — all lectures by a lecturer, all exams across a program, etc.

```typescript
// All exams in current semester across all programs
const results = await rtu.find({ type: 'exam' })

// All lectures by a specific lecturer
const results = await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R', program: 'RDBD0' }
)

// Complex filter — lectures by lecturer OR any exam
const results = await rtu.find(
  { $or: [
    { type: 'lecture', lecturer: { $regex: /Bērziņš/i } },
    { type: 'exam' }
  ]},
  { period: '25/26-R', program: 'RDBD0' }
)

// Entries in a specific week range
const results = await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)
```

### Signature

```typescript
rtu.find(filter: object, scope?: QueryScope): Promise<QueryResult>
```

### QueryScope

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

The filter uses [MongoDB query syntax](https://github.com/crcn/sift.js) applied to `ScheduleEntry` fields:

| Operator | Description | Example |
|---|---|---|
| `$eq` | Equal | `{ type: { $eq: 'exam' } }` or just `{ type: 'exam' }` |
| `$ne` | Not equal | `{ type: { $ne: 'lab' } }` |
| `$in` | In list | `{ type: { $in: ['exam', 'test'] } }` |
| `$nin` | Not in list | `{ type: { $nin: ['lab', 'practical'] } }` |
| `$gt` / `$gte` | Greater than | `{ weekNumber: { $gte: 10 } }` |
| `$lt` / `$lte` | Less than | `{ durationMinutes: { $lte: 90 } }` |
| `$regex` | Regex match | `{ lecturer: { $regex: /Smith/i } }` |
| `$exists` | Field exists | `{ building: { $exists: true } }` |
| `$and` | All conditions | `{ $and: [{ type: 'lecture' }, { dayOfWeek: 1 }] }` |
| `$or` | Any condition | `{ $or: [{ type: 'exam' }, { type: 'test' }] }` |
| `$not` | Negate | `{ $not: { type: 'lab' } }` |

> **Lecturer tip:** `$regex` matches only the `lecturer` string field. For robust matching across `lecturers[]` too, chain `filterByLecturer()` on the result.

### QueryResult

`find()` returns a `QueryResult` — same filtering/grouping API as `Schedule`, plus multi-source metadata:

```typescript
results.count                    // total entries
results.isEmpty                  // boolean
results.partial                  // true if some group fetches failed
results.errors                   // QueryError[] — what failed and why
results.sources                  // QuerySource[] — which groups were searched

// Same filter/group/convenience methods as Schedule
results.filterByType('lecture')
results.filterByLecturer('Bērziņš')
results.getThisWeek()
results.groupByWeek()
results.groupBySource()          // Map keyed by "program-course-group"
results.sorted('asc')

// Iterate
for (const entry of results) { ... }
[...results]
```

Each entry has `_source` set to the program/course/group it came from:

```typescript
for (const entry of results) {
  console.log(entry._source?.program.code)  // e.g. 'RDBD0'
  console.log(entry._source?.group?.name)   // e.g. '13. grupa'
}
```

## Schedule Class

### Filtering

All filters return a new `Schedule` object:

```typescript
schedule.filter(e => e.durationMinutes > 60)    // Custom filter
schedule.filterByType('lecture')                 // By type
schedule.filterByType(['lecture', 'lab'])        // Multiple types
schedule.filterByDateRange(from, to)             // Date range
schedule.filterByDate(date)                      // Specific date
schedule.filterByLecturer('Smith')               // By lecturer
schedule.filterBySubject('Programming')          // By subject
schedule.filterByLocation('Building A')          // By location
schedule.filterByDayOfWeek(1)                    // By weekday (1=Monday)
```

**Types:** `lecture` | `practical` | `lab` | `seminar` | `consultation` | `exam` | `test` | `other`

### Grouping

```typescript
schedule.groupByWeek()       // Map<weekNumber, ScheduleEntry[]>
schedule.groupByDate()       // Map<'YYYY-MM-DD', ScheduleEntry[]>
schedule.groupByDayOfWeek()  // Map<1-7, ScheduleEntry[]>
schedule.groupBySubject()    // Map<subjectCode, ScheduleEntry[]>
schedule.groupByLecturer()   // Map<name, ScheduleEntry[]>
schedule.groupByType()       // Map<type, ScheduleEntry[]>
```

### Convenience Methods

```typescript
schedule.getToday()          // Today's entries
schedule.getTomorrow()       // Tomorrow's entries
schedule.getThisWeek()       // This week's entries
schedule.getNextWeek()       // Next week's entries
schedule.getUpcoming(7)      // Next N days
schedule.getWeek(36)         // Specific week
```

### Aggregation

```typescript
schedule.getLecturers()      // string[] - unique lecturers
schedule.getSubjects()       // {name, code}[] - unique subjects
schedule.getLocations()      // string[] - unique locations
schedule.getTypes()          // ScheduleEntryType[] - used types
schedule.getDateRange()      // {start, end} | null - date range
```

### Properties

```typescript
schedule.count               // Entry count
schedule.isEmpty             // Is empty
schedule.first               // First entry
schedule.last                // Last entry
schedule.entries             // ScheduleEntry[] - all entries
schedule.sorted('asc')       // Sorted by date
schedule.toArray()           // Array copy

// Iterable
for (const entry of schedule) { ... }
[...schedule]
```

## ScheduleEntry Structure

```typescript
interface ScheduleEntry {
  id: number;
  subject: { name: string; code: string };

  // Time
  date: Date;
  startTime: string;         // "09:00"
  endTime: string;           // "10:30"
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;

  // Location
  location: string;          // "Building A-423"
  building?: string;         // "Building A"
  room?: string;             // "423"

  // People
  lecturer: string;
  lecturers: string[];       // If multiple

  // Classification
  type: ScheduleEntryType;
  typeRaw: string;           // Original type string

  // Group
  group: string;
  groups: string[];          // If multiple

  // Week
  weekNumber: number;
  dayOfWeek: number;         // 1-7 (Mon-Sun)
  dayName: string;           // "Monday"
}
```

## Error Handling

```typescript
import {
  PeriodNotFoundError,      // Period not found
  ProgramNotFoundError,     // Program not found
  CourseNotFoundError,      // Course not found
  GroupNotFoundError,       // Group not found
  InvalidOptionsError,      // Invalid options passed to getSchedule()
  InvalidQueryError,        // Invalid filter passed to find()
  DiscoveryError            // Discovery error
} from 'rtu-schedule-unofficial-client';

try {
  const schedule = await rtu.getSchedule({ ... });
} catch (error) {
  if (error instanceof PeriodNotFoundError) {
    console.error(`Period not found: ${error.input}`);
  }
}
```

## Configuration

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,                  // API timeout ms
  cacheTimeout: 300000,            // API cache 5 min
  discoveryCacheTimeout: 3600000   // Discovery cache 1h
});

// Cache
rtu.clearCache();    // Clear cache
await rtu.refresh(); // Refresh
```

## Low-Level API

```typescript
import { apiClient, htmlParser } from 'rtu-schedule-unofficial-client';

// Direct API calls
const events = await apiClient.fetchSemesterProgramEvents({
  semesterProgramId: 123, year: 2025, month: 9
});
const subjects = await apiClient.fetchSemesterProgramSubjects(123);
const isPublished = await apiClient.checkSemesterProgramPublished(123);
const groups = await apiClient.findGroupsByCourse({
  courseId: 1, semesterId: 45, programId: 123
});
const courses = await apiClient.findCoursesByProgram({
  semesterId: 45, programId: 123
});

// HTML parsing
const semesters = htmlParser.parseHtmlSemesters(html);
const programs = htmlParser.parseHtmlPrograms(html);
```

## TypeScript Support

```typescript
import type {
  // High-level
  StudyPeriod, StudyProgram, StudyCourse, StudyGroup,
  ScheduleEntry, ScheduleEntryType, GetScheduleOptions,

  // find() / QueryResult
  QueryScope, QuerySource, QueryError,

  // Low-level
  SemesterEvent, Subject, Group, Course, Faculty, Semester
} from 'rtu-schedule-unofficial-client';
```

## Examples

### Full Workflow

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

async function getMySchedule() {
  const rtu = new RTUSchedule();

  // 1. Get available periods for UI dropdown
  const periods = await rtu.getPeriods();
  console.log('Periods:', periods.map(p => p.name));

  // 2. Get programs for selected period
  const programs = await rtu.getPrograms(periods[0].id);
  console.log('Programs:', programs.map(p => `${p.name} (${p.code})`));

  // 3. Get schedule
  const schedule = await rtu.getSchedule({
    period: '25/26-R',
    program: 'RDBD0',
    course: 1,
    group: 13
  });

  // 4. Analyze schedule
  console.log(`Total: ${schedule.count} entries`);
  console.log(`Lecturers: ${schedule.getLecturers().join(', ')}`);
  console.log(`Subjects: ${schedule.getSubjects().map(s => s.name).join(', ')}`);

  // 5. Filter and group
  const lectures = schedule.filterByType('lecture');
  const byWeek = schedule.groupByWeek();

  for (const [week, entries] of byWeek) {
    console.log(`Week ${week}: ${entries.length} entries`);
  }

  return schedule;
}
```