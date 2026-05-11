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
  <a href="#ātrais-sākums">Ātrais sākums</a> •
  <a href="#api-metodes">API</a> •
  <a href="#meklēšana-vairākās-grupās">Meklēšana</a> •
  <a href="#schedule-klase">Schedule</a> •
  <a href="#piemēri">Piemēri</a>
</p>

## Instalācija

```bash
npm install rtu-schedule-unofficial-client
```

## Ātrais sākums

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

const rtu = new RTUSchedule();

// Iegūt sarakstu ar pieejamajiem periodiem, programmām, kursiem, grupām
const periods = await rtu.getPeriods();
const programs = await rtu.getPrograms('25/26-R');
const courses = await rtu.getCourses('25/26-R', 'RDBD0');
const groups = await rtu.getGroups('25/26-R', 'RDBD0', 1);

// Iegūt nodarbību sarakstu
const schedule = await rtu.getSchedule({
  period: '25/26-R',      // Rudens 2025/2026
  program: 'RDBD0',       // Datorsistēmas
  course: 1,              // 1. kurss
  group: 13               // 13. grupa (neobligāts)
});

// Strādāt ar rezultātiem
console.log(schedule.count);                        // Ierakstu skaits
const lectures = schedule.filterByType('lecture');  // Tikai lekcijas
const thisWeek = schedule.getThisWeek();            // Šīs nedēļas nodarbības
const byDay = schedule.groupByDate();               // Grupēt pēc datuma
```

## API Metodes

### Atklāšana

```typescript
// Visi pieejamie semestri
const periods = await rtu.getPeriods();
// → [{ id, name, code, season, startDate, endDate, isSelected }, ...]

// Pašreizējais semestris
const current = await rtu.getCurrentPeriod();

// Programmas konkrētam semestrim (pēc ID, koda vai nosaukuma)
const programs = await rtu.getPrograms('25/26-R');
const programs = await rtu.getPrograms(45);
const programs = await rtu.getPrograms('Rudens 2025');

// Kursi un grupas
const courses = await rtu.getCourses('25/26-R', 'RDBD0');
const groups = await rtu.getGroups('25/26-R', 'RDBD0', 1);
```

### Nodarbību iegūšana

```typescript
const schedule = await rtu.getSchedule({
  // Periods - kods, nosaukums vai ID
  period: '25/26-R',        // vai: 'Rudens 2025', periodId: 45

  // Programma - kods, nosaukums vai ID
  program: 'RDBD0',         // vai: 'Datorsistēmas', programId: 123

  // Kurss (obligāts)
  course: 1,

  // Grupa (neobligāts - bez tās atgriež visas grupas)
  group: 13,

  // Datumu diapazons (neobligāts - pēc noklusējuma semestra datumi)
  startDate: '2025-09-01',
  endDate: '2025-12-31'
});
```

## Meklēšana vairākās grupās

`getSchedule()` iegūst datus vienai grupai. `find()` meklē vairākās grupās, kursos vai programmās vienlaicīgi — lai atrastu visas konkrēta pasniedzēja lekcijas, visus eksāmenus programmā utt.

```typescript
// Visi eksāmeni pašreizējā semestrī visās programmās
const results = await rtu.find({ type: 'exam' })

// Visas konkrēta pasniedzēja lekcijas
const results = await rtu.find(
  { lecturer: { $regex: /Bērziņš/i } },
  { period: '25/26-R', program: 'RDBD0' }
)

// Komplekss filtrs — pasniedzēja lekcijas VAI jebkurš eksāmens
const results = await rtu.find(
  { $or: [
    { type: 'lecture', lecturer: { $regex: /Bērziņš/i } },
    { type: 'exam' }
  ]},
  { period: '25/26-R', program: 'RDBD0' }
)

// Konkrētā nedēļu diapazonā
const results = await rtu.find(
  { weekNumber: { $gte: 10, $lte: 15 } },
  { period: '25/26-R', program: 'RDBD0', course: 1, group: 13 }
)
```

### Paraksts

```typescript
rtu.find(filter: object, scope?: QueryScope): Promise<QueryResult>
```

### QueryScope

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

| Operators | Apraksts | Piemērs |
|---|---|---|
| `$eq` | Vienāds | `{ type: { $eq: 'exam' } }` vai vienkārši `{ type: 'exam' }` |
| `$ne` | Nav vienāds | `{ type: { $ne: 'lab' } }` |
| `$in` | Sarakstā | `{ type: { $in: ['exam', 'test'] } }` |
| `$nin` | Nav sarakstā | `{ type: { $nin: ['lab', 'practical'] } }` |
| `$gt` / `$gte` | Lielāks par | `{ weekNumber: { $gte: 10 } }` |
| `$lt` / `$lte` | Mazāks par | `{ durationMinutes: { $lte: 90 } }` |
| `$regex` | Regulārā izteiksme | `{ lecturer: { $regex: /Bērziņš/i } }` |
| `$exists` | Lauks eksistē | `{ building: { $exists: true } }` |
| `$and` | Visi nosacījumi | `{ $and: [{ type: 'lecture' }, { dayOfWeek: 1 }] }` |
| `$or` | Jebkurš nosacījums | `{ $or: [{ type: 'exam' }, { type: 'test' }] }` |
| `$not` | Noliegums | `{ $not: { type: 'lab' } }` |

> **Padoms par pasniedzēju:** `$regex` meklē tikai `lecturer` laukā. Lai meklētu arī `lecturers[]` masīvā, izmantojiet `filterByLecturer()` uz rezultāta.

### QueryResult

`find()` atgriež `QueryResult` — tāda pati filtrēšanas/grupēšanas saskarne kā `Schedule`, plus vairāku avotu metadati:

```typescript
results.count                    // kopējais ierakstu skaits
results.isEmpty                  // boolean
results.partial                  // true, ja daži grupas pieprasījumi neizdevās
results.errors                   // QueryError[] — kas neizdevās un kāpēc
results.sources                  // QuerySource[] — kuras grupas tika meklētas

// Tādas pašas filtrēšanas/grupēšanas/ērtības metodes kā Schedule
results.filterByType('lecture')
results.filterByLecturer('Bērziņš')
results.getThisWeek()
results.groupByWeek()
results.groupBySource()          // Map ar atslēgu "programma-kurss-grupa"
results.sorted('asc')

// Iterējams
for (const entry of results) { ... }
[...results]
```

Katram ierakstam ir `_source` ar programmas/kursa/grupas informāciju:

```typescript
for (const entry of results) {
  console.log(entry._source?.program.code)  // piem. 'RDBD0'
  console.log(entry._source?.group?.name)   // piem. '13. grupa'
}
```

## Schedule Klase

### Filtrēšana

Visi filtri atgriež jaunu `Schedule` objektu:

```typescript
schedule.filter(e => e.durationMinutes > 60)    // Pielāgots filtrs
schedule.filterByType('lecture')                 // Pēc tipa
schedule.filterByType(['lecture', 'lab'])        // Vairāki tipi
schedule.filterByDateRange(from, to)             // Datumu diapazons
schedule.filterByDate(date)                      // Konkrēts datums
schedule.filterByLecturer('Bērziņš')             // Pēc pasniedzēja
schedule.filterBySubject('Programmēšana')        // Pēc priekšmeta
schedule.filterByLocation('Ķīpsala')             // Pēc vietas
schedule.filterByDayOfWeek(1)                    // Pēc nedēļas dienas (1=Pirmdiena)
```

**Tipi:** `lecture` | `practical` | `lab` | `seminar` | `consultation` | `exam` | `test` | `other`

### Grupēšana

```typescript
schedule.groupByWeek()       // Map<weekNumber, ScheduleEntry[]>
schedule.groupByDate()       // Map<'YYYY-MM-DD', ScheduleEntry[]>
schedule.groupByDayOfWeek()  // Map<1-7, ScheduleEntry[]>
schedule.groupBySubject()    // Map<subjectCode, ScheduleEntry[]>
schedule.groupByLecturer()   // Map<name, ScheduleEntry[]>
schedule.groupByType()       // Map<type, ScheduleEntry[]>
```

### Ērtības metodes

```typescript
schedule.getToday()          // Šodienas nodarbības
schedule.getTomorrow()       // Rītdienas nodarbības
schedule.getThisWeek()       // Šīs nedēļas nodarbības
schedule.getNextWeek()       // Nākamās nedēļas nodarbības
schedule.getUpcoming(7)      // Tuvākās N dienas
schedule.getWeek(36)         // Konkrēta nedēļa
```

### Apkopojums

```typescript
schedule.getLecturers()      // string[] - unikālie pasniedzēji
schedule.getSubjects()       // {name, code}[] - unikālie priekšmeti
schedule.getLocations()      // string[] - unikālās vietas
schedule.getTypes()          // ScheduleEntryType[] - izmantotie tipi
schedule.getDateRange()      // {start, end} | null - datumu diapazons
```

### Īpašības

```typescript
schedule.count               // Ierakstu skaits
schedule.isEmpty             // Vai tukšs
schedule.first               // Pirmais ieraksts
schedule.last                // Pēdējais ieraksts
schedule.entries             // ScheduleEntry[] - visi ieraksti
schedule.sorted('asc')       // Sakārtots pēc datuma
schedule.toArray()           // Masīva kopija

// Iterējams
for (const entry of schedule) { ... }
[...schedule]
```

## ScheduleEntry Struktūra

```typescript
interface ScheduleEntry {
  id: number;
  subject: { name: string; code: string };

  // Laiks
  date: Date;
  startTime: string;         // "09:00"
  endTime: string;           // "10:30"
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;

  // Vieta
  location: string;          // "Ķīpsalas iela 6A-423"
  building?: string;         // "Ķīpsalas iela 6A"
  room?: string;             // "423"

  // Cilvēki
  lecturer: string;
  lecturers: string[];       // Ja vairāki

  // Klasifikācija
  type: ScheduleEntryType;
  typeRaw: string;           // Oriģinālais tips

  // Grupa
  group: string;
  groups: string[];          // Ja vairākas

  // Nedēļa
  weekNumber: number;
  dayOfWeek: number;         // 1-7 (Pr-Sv)
  dayName: string;           // "Pirmdiena"
}
```

## Kļūdu apstrāde

```typescript
import {
  PeriodNotFoundError,      // Periods nav atrasts
  ProgramNotFoundError,     // Programma nav atrasta
  CourseNotFoundError,      // Kurss nav atrasts
  GroupNotFoundError,       // Grupa nav atrasta
  InvalidOptionsError,      // Nederīgi parametri getSchedule()
  InvalidQueryError,        // Nederīgs filtrs find()
  DiscoveryError            // Atklāšanas kļūda
} from 'rtu-schedule-unofficial-client';

try {
  const schedule = await rtu.getSchedule({ ... });
} catch (error) {
  if (error instanceof PeriodNotFoundError) {
    console.error(`Periods nav atrasts: ${error.input}`);
  }
}
```

## Konfigurācija

```typescript
const rtu = new RTUSchedule({
  timeout: 10000,                  // API timeout ms
  cacheTimeout: 300000,            // API kešs 5 min
  discoveryCacheTimeout: 3600000   // Atklāšanas kešs 1h
});

// Kešs
rtu.clearCache();    // Notīrīt kešu
await rtu.refresh(); // Atsvaidzināt
```

## Zemā līmeņa API

```typescript
import { apiClient, htmlParser } from 'rtu-schedule-unofficial-client';

// Tiešie API izsaukumi
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

// HTML parsēšana
const semesters = htmlParser.parseHtmlSemesters(html);
const programs = htmlParser.parseHtmlPrograms(html);
```

## TypeScript Tipi

```typescript
import type {
  // Augsta līmeņa
  StudyPeriod, StudyProgram, StudyCourse, StudyGroup,
  ScheduleEntry, ScheduleEntryType, GetScheduleOptions,

  // find() / QueryResult
  QueryScope, QuerySource, QueryError,

  // Zema līmeņa
  SemesterEvent, Subject, Group, Course, Faculty, Semester
} from 'rtu-schedule-unofficial-client';
```

## Piemēri

### Pilna darbplūsma

```typescript
import { RTUSchedule } from 'rtu-schedule-unofficial-client';

async function getMySchedule() {
  const rtu = new RTUSchedule();

  // 1. Iegūt pieejamos periodus UI izvēlnei
  const periods = await rtu.getPeriods();
  console.log('Periodi:', periods.map(p => p.name));

  // 2. Iegūt programmas izvēlētajam periodam
  const programs = await rtu.getPrograms(periods[0].id);
  console.log('Programmas:', programs.map(p => `${p.name} (${p.code})`));

  // 3. Iegūt nodarbību sarakstu
  const schedule = await rtu.getSchedule({
    period: '25/26-R',
    program: 'RDBD0',
    course: 1,
    group: 13
  });

  // 4. Analizēt nodarbības
  console.log(`Kopā: ${schedule.count} nodarbības`);
  console.log(`Pasniedzēji: ${schedule.getLecturers().join(', ')}`);
  console.log(`Priekšmeti: ${schedule.getSubjects().map(s => s.name).join(', ')}`);

  // 5. Filtrēt un grupēt
  const lectures = schedule.filterByType('lecture');
  const byWeek = schedule.groupByWeek();

  for (const [week, entries] of byWeek) {
    console.log(`Nedēļa ${week}: ${entries.length} nodarbības`);
  }

  return schedule;
}
```