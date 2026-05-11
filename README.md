<h1 align="center">
  <br />
  <a href="https://www.rtu.lv">
    <img height="220" src="assets/rtu_logo_en.jpg" alt="RTU" style="border-radius: 20px;" />
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
  <a href="#usage">Usage</a> •
  <a href="#filter-operators">Filters</a> •
  <a href="#results">Results</a> •
  <a href="#errors">Errors</a>
</p>

## Installation

```bash
npm install rtu-schedule-unofficial-client
```

## Usage

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

// All exams this semester across all programs
await rtu.find({ type: 'exam' })

// All lectures by a lecturer, scoped to one program
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

// Narrow to a single group
await rtu.find(
  { type: { $in: ['exam', 'test'] } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)

// Entries in a specific week range
await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0' }
)
```

`find()` fans out across all groups matching the scope, applies the filter, and returns a `QueryResult`. With no scope it searches the entire current semester.

### Scope

```typescript
interface QueryScope {
  period?: number | string    // defaults to current period
  program?: number | string   // defaults to all programs — narrow to avoid excess API calls
  course?: number             // defaults to all courses
  group?: number              // defaults to all groups
  startDate?: Date | string   // defaults to period start
  endDate?: Date | string     // defaults to period end
  concurrency?: number        // max parallel requests, default 5
}
```

## Filter Operators

Standard [MongoDB query syntax](https://github.com/crcn/sift.js) applied to `ScheduleEntry` fields:

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

> `$regex` matches the scalar `lecturer` field only. For matching across `lecturers[]` too, chain `.filterByLecturer()` on the result.

## Results

`find()` returns a `QueryResult`:

```typescript
result.count
result.isEmpty
result.entries             // ScheduleEntry[]
result.partial             // true if some group fetches failed
result.errors              // QueryError[]
result.sources             // QuerySource[] — which groups were searched

// Filtering — each returns a new QueryResult
result.filter(e => e.durationMinutes > 90)
result.filterByType('lecture')
result.filterByType(['lecture', 'lab'])
result.filterByLecturer('Smith')
result.filterBySubject('Math')
result.filterByLocation('Building A')
result.filterByDate(date)
result.filterByDateRange(from, to)
result.filterByDayOfWeek(1)   // 1=Monday … 7=Sunday

// Convenience
result.getToday()
result.getTomorrow()
result.getThisWeek()
result.getNextWeek()
result.getUpcoming(7)
result.getWeek(36)
result.getCurrentWeek()

// Grouping
result.groupByWeek()       // Map<number, ScheduleEntry[]>
result.groupByDate()       // Map<string, ScheduleEntry[]>
result.groupByDayOfWeek()  // Map<number, ScheduleEntry[]>
result.groupBySubject()    // Map<string, ScheduleEntry[]>
result.groupByLecturer()   // Map<string, ScheduleEntry[]>
result.groupByType()       // Map<ScheduleEntryType, ScheduleEntry[]>
result.groupBySource()     // Map<string, ScheduleEntry[]>

// Aggregation
result.getLecturers()      // string[]
result.getSubjects()       // { name, code }[]
result.getLocations()      // string[]
result.getTypes()          // ScheduleEntryType[]
result.getSources()        // QuerySource[]

result.sorted('asc')
result.toArray()
for (const entry of result) { ... }
[...result]
```

### ScheduleEntry

```typescript
interface ScheduleEntry {
  id: number
  subject: { name: string; code: string }

  date: Date
  startTime: string         // "09:00"
  endTime: string           // "10:30"
  startDateTime: Date
  endDateTime: Date
  durationMinutes: number

  location: string
  building?: string
  room?: string

  lecturer: string
  lecturers: string[]

  type: ScheduleEntryType   // 'lecture' | 'practical' | 'lab' | 'seminar' | 'consultation' | 'exam' | 'test' | 'other'
  typeRaw: string

  group: string
  groups: string[]

  weekNumber: number
  dayOfWeek: number         // 1–7 (Mon–Sun)
  dayName: string

  _source?: {               // set by find()
    program: StudyProgram
    course: StudyCourse
    group: StudyGroup | undefined
  }
}
```

## Errors

| Error | When |
|---|---|
| `PeriodNotFoundError` | scope.period not found |
| `ProgramNotFoundError` | scope.program not found |
| `CourseNotFoundError` | scope.course not found |
| `GroupNotFoundError` | scope.group not found |
| `InvalidQueryError` | filter is not a valid sift query |
| `DiscoveryError` | failed to reach the RTU website |

Fetch failures for individual groups are non-throwing — they appear in `result.partial` and `result.errors`.

```typescript
import { PeriodNotFoundError } from 'rtu-schedule-unofficial-client';

try {
  await rtu.find({}, { period: 'bad' });
} catch (e) {
  if (e instanceof PeriodNotFoundError) console.error(e.input);
}
```

## Configuration

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,
  cacheTimeout: 300000,           // default 5 min
  discoveryCacheTimeout: 3600000  // default 1h
});

rtu.clearCache();
rtu.refresh();
```

## TypeScript

```typescript
import type {
  ScheduleEntry, ScheduleEntryType,
  QueryScope, QuerySource, QueryError,
  StudyPeriod, StudyProgram, StudyCourse, StudyGroup
} from 'rtu-schedule-unofficial-client';
```
