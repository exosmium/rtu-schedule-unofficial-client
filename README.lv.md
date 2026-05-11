<h1 align="center">
  <br />
  <a href="https://www.rtu.lv">
    <img height="220" src="assets/rtu_logo_lv.jpg" alt="RTU" style="border-radius: 20px;" />
  </a>
</h1>

<h2 align="center">RTU Nodarbību API</h2>

<p align="center">
  <em>Izveidojis RTU students, kurš atklāja, ka pat labai universitātei var trūkt publiskas API nodarbību sarakstam.<br />Šī bibliotēka novērš šo trūkumu, padarot RTU nodarbību datus pieejamus visiem.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rtu-schedule-unofficial-client">
    <img src="https://img.shields.io/npm/v/rtu-schedule-unofficial-client.svg" alt="npm versija" />
  </a>
  <a href="https://www.npmjs.com/package/rtu-schedule-unofficial-client">
    <img src="https://img.shields.io/npm/dm/rtu-schedule-unofficial-client.svg" alt="npm lejupielādes" />
  </a>
  <a href="README.md">
    <img src="https://img.shields.io/badge/lang-en-blue.svg" alt="English" />
  </a>
  <img src="https://img.shields.io/badge/lang-lv-red.svg" alt="Latviešu" />
</p>

<p align="center">
  <a href="#instalācija">Instalācija</a> •
  <a href="#lietošana">Lietošana</a> •
  <a href="#filtra-operatori">Filtri</a> •
  <a href="#rezultāti">Rezultāti</a> •
  <a href="#kļūdas">Kļūdas</a>
</p>

## Instalācija

```bash
npm install rtu-schedule-unofficial-client
```

## Lietošana

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

// Visi eksāmeni šajā semestrī visās programmās
await rtu.find({ type: 'exam' })

// Visas konkrēta pasniedzēja lekcijas, sašaurinātas līdz vienai programmai
await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R', program: 'RDBD0' }
)

// Pasniedzēja lekcijas VAI jebkurš eksāmens
await rtu.find(
  { $or: [
    { type: 'lecture', lecturer: { $regex: /Bērziņš/i } },
    { type: 'exam' }
  ]},
  { period: '25/26-R', program: 'RDBD0' }
)

// Sašaurināt līdz vienai grupai
await rtu.find(
  { type: { $in: ['exam', 'test'] } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)

// Ieraksti konkrētā nedēļu diapazonā
await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0' }
)
```

`find()` meklē visās grupās, kas atbilst tvērumam, piemēro filtru un atgriež `QueryResult`. Bez tvēruma meklē visā pašreizējā semestrī.

### Tvērums (Scope)

```typescript
interface QueryScope {
  period?: number | string    // pēc noklusējuma — pašreizējais periods
  program?: number | string   // pēc noklusējuma — visas programmas — sašauriniet, lai samazinātu API pieprasījumus
  course?: number             // pēc noklusējuma — visi kursi
  group?: number              // pēc noklusējuma — visas grupas
  startDate?: Date | string   // pēc noklusējuma — perioda sākums
  endDate?: Date | string     // pēc noklusējuma — perioda beigas
  concurrency?: number        // maks. paralēlie pieprasījumi, noklusējums 5
}
```

## Filtra operatori

Standarta [MongoDB vaicājumu sintakse](https://github.com/crcn/sift.js) uz `ScheduleEntry` laukiem:

| Operators | Piemērs |
|---|---|
| `$eq` | `{ type: 'exam' }` |
| `$ne` | `{ type: { $ne: 'lab' } }` |
| `$in` | `{ type: { $in: ['exam', 'test'] } }` |
| `$nin` | `{ type: { $nin: ['lab', 'practical'] } }` |
| `$gt` / `$gte` | `{ weekNumber: { $gte: 10 } }` |
| `$lt` / `$lte` | `{ durationMinutes: { $lte: 90 } }` |
| `$regex` | `{ lecturer: { $regex: /Bērziņš/i } }` |
| `$exists` | `{ building: { $exists: true } }` |
| `$and` | `{ $and: [{ type: 'lecture' }, { dayOfWeek: 1 }] }` |
| `$or` | `{ $or: [{ type: 'exam' }, { type: 'test' }] }` |
| `$not` | `{ $not: { type: 'lab' } }` |

> `$regex` meklē tikai skalārajā `lecturer` laukā. Lai meklētu arī `lecturers[]` masīvā, izmantojiet `.filterByLecturer()` uz rezultāta.

## Rezultāti

`find()` atgriež `QueryResult`:

```typescript
result.count
result.isEmpty
result.entries             // ScheduleEntry[]
result.partial             // true, ja daži grupas pieprasījumi neizdevās
result.errors              // QueryError[]
result.sources             // QuerySource[] — kuras grupas tika meklētas

// Filtrēšana — katrs atgriež jaunu QueryResult
result.filter(e => e.durationMinutes > 90)
result.filterByType('lecture')
result.filterByType(['lecture', 'lab'])
result.filterByLecturer('Bērziņš')
result.filterBySubject('Matemātika')
result.filterByLocation('Ķīpsala')
result.filterByDate(date)
result.filterByDateRange(from, to)
result.filterByDayOfWeek(1)   // 1=Pirmdiena … 7=Svētdiena

// Ērtības metodes
result.getToday()
result.getTomorrow()
result.getThisWeek()
result.getNextWeek()
result.getUpcoming(7)
result.getWeek(36)
result.getCurrentWeek()

// Grupēšana
result.groupByWeek()       // Map<number, ScheduleEntry[]>
result.groupByDate()       // Map<string, ScheduleEntry[]>
result.groupByDayOfWeek()  // Map<number, ScheduleEntry[]>
result.groupBySubject()    // Map<string, ScheduleEntry[]>
result.groupByLecturer()   // Map<string, ScheduleEntry[]>
result.groupByType()       // Map<ScheduleEntryType, ScheduleEntry[]>
result.groupBySource()     // Map<string, ScheduleEntry[]>

// Apkopojums
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

### ScheduleEntry struktūra

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
  dayOfWeek: number         // 1–7 (Pr–Sv)
  dayName: string

  _source?: {               // iestatīts ar find()
    program: StudyProgram
    course: StudyCourse
    group: StudyGroup | undefined
  }
}
```

## Kļūdas

| Kļūda | Kad |
|---|---|
| `PeriodNotFoundError` | scope.period nav atrasts |
| `ProgramNotFoundError` | scope.program nav atrasta |
| `CourseNotFoundError` | scope.course nav atrasts |
| `GroupNotFoundError` | scope.group nav atrasta |
| `InvalidQueryError` | filtrs nav derīgs sift vaicājums |
| `DiscoveryError` | neizdevās sasniegt RTU vietni |

Atsevišķu grupu pieprasījumu kļūmes netiek izmestas — tās parādās `result.partial` un `result.errors`.

```typescript
import { PeriodNotFoundError } from 'rtu-schedule-unofficial-client';

try {
  await rtu.find({}, { period: 'nav' });
} catch (e) {
  if (e instanceof PeriodNotFoundError) console.error(e.input);
}
```

## Konfigurācija

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,
  cacheTimeout: 300000,           // noklusējums 5 min
  discoveryCacheTimeout: 3600000  // noklusējums 1h
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
