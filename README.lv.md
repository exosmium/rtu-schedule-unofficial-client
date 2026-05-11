<h1 align="center">
  <br />
  <a href="https://www.rtu.lv">
    <img height="220" src="https://www.rtu.lv/download/rtu_logo_lv.jpg" alt="RTU" style="border-radius: 20px;" />
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
  <a href="#nodarbību-iegūšana">Saraksts</a> •
  <a href="#meklēšana-vairākās-grupās">Meklēšana</a> •
  <a href="#darbs-ar-rezultātiem">Rezultāti</a> •
  <a href="#piemēri">Piemēri</a>
</p>

## Instalācija

```bash
npm install rtu-schedule-unofficial-client
```

## Nodarbību iegūšana

Iegūst nodarbību sarakstu konkrētai grupai. Periods, programma, kurss un grupa tiek atrisināti automātiski no lasāmiem nosaukumiem — ID nav vajadzīgi.

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

const schedule = await rtu.getSchedule({
  period: '25/26-R',   // semestra kods, nosaukums vai skaitlisks ID — pēc noklusējuma pašreizējais
  program: 'RDBD0',    // programmas kods, nosaukums vai skaitlisks ID
  course: 1,           // studiju gads
  group: 13,           // grupas numurs (neobligāts — izlaist, lai iegūtu visas grupas)

  // Datumu diapazons (neobligāts — pēc noklusējuma pilns semestris)
  startDate: '2025-09-01',
  endDate: '2025-12-31'
});

console.log(schedule.count);
const lekcijas = schedule.filterByType('lecture');
const šīNedēļa = schedule.getThisWeek();
```

## Meklēšana vairākās grupās

`find()` meklē vairākās grupās, kursos vai programmās — atbildot uz jautājumiem, ko `getSchedule()` nevar: visas konkrēta pasniedzēja lekcijas, visi eksāmeni programmā utt.

```typescript
// Visi eksāmeni pašreizējā semestrī, visās programmās
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

// Ieraksti konkrētā nedēļu diapazonā
await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)
```

### Tvērums (Scope)

```typescript
interface QueryScope {
  period?: number | string    // pēc noklusējuma — pašreizējais periods
  program?: number | string   // pēc noklusējuma — visas programmas (daudz API pieprasījumu — sašauriniet, ja iespējams)
  course?: number             // pēc noklusējuma — visi kursi
  group?: number              // pēc noklusējuma — visas grupas
  startDate?: Date | string   // pēc noklusējuma — perioda sākums
  endDate?: Date | string     // pēc noklusējuma — perioda beigas
  concurrency?: number        // maks. paralēlie pieprasījumi, noklusējums 5
}
```

### Filtra operatori

Filtrs izmanto [MongoDB vaicājumu sintaksi](https://github.com/crcn/sift.js) uz `ScheduleEntry` laukiem:

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

> **Padoms par pasniedzēju:** `$regex` meklē tikai skalārajā `lecturer` laukā. Lai meklētu arī `lecturers[]` masīvā, izmantojiet `.filterByLecturer()` uz rezultāta.

## Darbs ar rezultātiem

Gan `getSchedule()`, gan `find()` atgriež rezultātu objektu ar vienādu filtrēšanas, grupēšanas un ērtības API. `find()` atgriež `QueryResult`, kas papildus satur vairāku avotu metadatus.

### Filtrēšana

Visas filtrēšanas metodes atgriež jaunu rezultātu objektu:

```typescript
result.filter(e => e.durationMinutes > 60)
result.filterByType('lecture')
result.filterByType(['lecture', 'lab'])
result.filterByDateRange(from, to)
result.filterByDate(date)
result.filterByLecturer('Bērziņš')
result.filterBySubject('Programmēšana')
result.filterByLocation('Ķīpsala')
result.filterByDayOfWeek(1)              // 1=Pirmdiena … 7=Svētdiena
```

**Tipi:** `lecture` | `practical` | `lab` | `seminar` | `consultation` | `exam` | `test` | `other`

### Grupēšana

```typescript
result.groupByWeek()       // Map<weekNumber, ScheduleEntry[]>
result.groupByDate()       // Map<'YYYY-MM-DD', ScheduleEntry[]>
result.groupByDayOfWeek()  // Map<1-7, ScheduleEntry[]>
result.groupBySubject()    // Map<subjectCode, ScheduleEntry[]>
result.groupByLecturer()   // Map<name, ScheduleEntry[]>
result.groupByType()       // Map<type, ScheduleEntry[]>
```

### Ērtības metodes

```typescript
result.getToday()
result.getTomorrow()
result.getThisWeek()
result.getNextWeek()
result.getUpcoming(7)      // tuvākās N dienas
result.getWeek(36)
result.getCurrentWeek()
```

### Apkopojums un īpašības

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

### QueryResult papildus (tikai find())

```typescript
result.partial             // true, ja daži grupas pieprasījumi neizdevās
result.errors              // QueryError[] — kas neizdevās un kāpēc
result.sources             // QuerySource[] — kuras grupas tika meklētas
result.groupBySource()     // Map ar atslēgu "programma-kurss-grupa"
result.getSources()        // QuerySource[]
```

Katram ierakstam ir `_source`, kas norāda tā izcelsmi:

```typescript
entry._source?.program.code   // piem. 'RDBD0'
entry._source?.group?.name    // piem. '13. grupa'
```

## ScheduleEntry struktūra

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

  location: string;          // "Ķīpsalas iela 6A-423"
  building?: string;
  room?: string;

  lecturer: string;
  lecturers: string[];

  type: ScheduleEntryType;
  typeRaw: string;

  group: string;
  groups: string[];

  weekNumber: number;
  dayOfWeek: number;         // 1-7 (Pr-Sv)
  dayName: string;

  _source?: QuerySource;     // iestatīts, ja iegūts ar find()
}
```

## Kļūdu apstrāde

```typescript
import {
  PeriodNotFoundError,
  ProgramNotFoundError,
  CourseNotFoundError,
  GroupNotFoundError,
  InvalidOptionsError,   // nepareizi parametri getSchedule()
  InvalidQueryError,     // nepareizs filtrs find()
  DiscoveryError
} from 'rtu-schedule-unofficial-client';

try {
  const result = await rtu.find({ type: 'exam' }, { period: 'nav' });
} catch (error) {
  if (error instanceof PeriodNotFoundError) {
    console.error(`Periods nav atrasts: ${error.input}`);
  }
}
```

## Konfigurācija

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,
  cacheTimeout: 300000,           // API kešs, noklusējums 5 min
  discoveryCacheTimeout: 3600000  // atklāšanas kešs, noklusējums 1h
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

## Piemēri

### Šīs nedēļas lekcijas

```typescript
const rtu = new RTUSchedule();

const schedule = await rtu.getSchedule({
  period: '25/26-R',
  program: 'RDBD0',
  course: 1,
  group: 13
});

const lekcijas = schedule.filterByType('lecture').getThisWeek();
console.log(`${lekcijas.count} lekcijas šonedēļ`);

for (const entry of lekcijas) {
  console.log(`${entry.dayName} ${entry.startTime} — ${entry.subject.name}`);
}
```

### Visi eksāmeni programmā

```typescript
const results = await rtu.find(
  { type: { $in: ['exam', 'test'] } },
  { period: '25/26-R', program: 'RDBD0' }
);

console.log(`Atrasti ${results.count} eksāmeni ${results.sources.length} grupās`);

const byWeek = results.groupByWeek();
for (const [week, entries] of byWeek) {
  console.log(`Nedēļa ${week}: ${entries.length} eksāmeni`);
}
```

### Pasniedzēja pilns saraksts

```typescript
const results = await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R' }
);

results.filterByLecturer('Bērziņš').groupByDate().forEach((entries, date) => {
  console.log(`${date}: ${entries.length} nodarbības`);
});
```
