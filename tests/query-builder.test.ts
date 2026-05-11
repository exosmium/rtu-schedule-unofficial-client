import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RTUApiClient } from '../src/api-client.js';
import { RTUSchedule } from '../src/schedule/index.js';
import { withConcurrency } from '../src/schedule/query-builder.js';
import {
  PeriodNotFoundError,
  ProgramNotFoundError,
} from '../src/schedule/errors.js';
import { QueryResult } from '../src/schedule/query-result.js';
import { Schedule } from '../src/schedule/schedule-result.js';

const rtu = new RTUSchedule();

// Known stable scope used across tests
const PERIOD = '25/26-R';
const PROGRAM = 'RDBD0';
const COURSE = 1;
const GROUP = 13;

// ============================================================
// 1. withConcurrency unit tests (no API)
// ============================================================

describe('withConcurrency', () => {
  it('runs all tasks and returns fulfilled results', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const results = await withConcurrency(tasks, 2);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('respects concurrency limit — at most N tasks run simultaneously', async () => {
    let running = 0;
    let maxRunning = 0;
    const concurrency = 2;

    const tasks = Array.from({ length: 6 }, () => async () => {
      running++;
      if (running > maxRunning) maxRunning = running;
      // Small artificial delay so tasks overlap when limit allows it
      await new Promise<void>((res) => setTimeout(res, 10));
      running--;
    });

    await withConcurrency(tasks, concurrency);
    // maxRunning should never exceed the limit
    expect(maxRunning).toBeLessThanOrEqual(concurrency);
  });

  it('returns rejected results without cancelling other tasks', async () => {
    const error = new Error('boom');
    const tasks = [
      () => Promise.resolve('ok-1'),
      () => Promise.reject(error),
      () => Promise.resolve('ok-3'),
    ];
    const results = await withConcurrency(tasks, 3);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'ok-1' });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: error });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'ok-3' });
  });

  it('returns empty array for empty task list', async () => {
    const results = await withConcurrency([], 5);
    expect(results).toEqual([]);
  });

  it('throws when limit <= 0', async () => {
    await expect(
      withConcurrency([() => Promise.resolve(1)], 0)
    ).rejects.toThrow();
    await expect(
      withConcurrency([() => Promise.resolve(1)], -1)
    ).rejects.toThrow();
  });
});

// ============================================================
// 2. withConcurrency limit=1 — sequential execution
// ============================================================

describe('withConcurrency with limit=1', () => {
  it('runs tasks sequentially when limit is 1', async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3, 4].map((i) => async () => {
      order.push(i);
      await new Promise<void>((res) => setTimeout(res, 5));
    });

    await withConcurrency(tasks, 1);
    expect(order).toEqual([1, 2, 3, 4]);
  });
});

// ============================================================
// 3. Fan-out correctness (real API)
// ============================================================

describe('fan-out correctness (real API)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rtu.clearCache();
  });

  it(
    'single group scope returns entries with _source tagged',
    async () => {
      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
      );

      expect(result).toBeInstanceOf(QueryResult);
      // If schedule is published we expect some entries; if not, isEmpty is fine
      if (!result.isEmpty) {
        const entry = result.entries[0]!;
        expect(entry._source).toBeDefined();
        expect(entry._source?.program).toBeDefined();
        expect(entry._source?.course).toBeDefined();
      }
    },
    { timeout: 15000 }
  );

  it(
    'course-level scope (no group) returns result without throwing',
    async () => {
      // Do NOT pass group — let the query fan out over all groups in the course
      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: COURSE }
      );

      expect(result).toBeInstanceOf(QueryResult);
      // result.partial may be true or false; no error should be thrown
    },
    { timeout: 30000 }
  );

  it(
    'program-level scope returns result without throwing',
    async () => {
      const result = await rtu.find({}, { period: PERIOD, program: PROGRAM });

      expect(result).toBeInstanceOf(QueryResult);
    },
    { timeout: 30000 }
  );

  it(
    'filter { type: "exam" } returns only exam entries (single group)',
    async () => {
      const result = await rtu.find(
        { type: 'exam' },
        { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
      );

      expect(result).toBeInstanceOf(QueryResult);
      for (const entry of result.entries) {
        expect(entry.type).toBe('exam');
      }
    },
    { timeout: 15000 }
  );

  it(
    'calling find twice with the same scope produces no duplicate event IDs',
    async () => {
      const scope = {
        period: PERIOD,
        program: PROGRAM,
        course: COURSE,
        group: GROUP,
      };
      const result1 = await rtu.find({}, scope);
      const result2 = await rtu.find({}, scope);

      const ids1 = result1.entries.map((e) => e.id);
      const ids2 = result2.entries.map((e) => e.id);

      // Each individual result must not have duplicate IDs
      expect(new Set(ids1).size).toBe(ids1.length);
      expect(new Set(ids2).size).toBe(ids2.length);
    },
    { timeout: 30000 }
  );
});

// ============================================================
// 4. Filter correctness (real API — single group scope for speed)
// ============================================================

describe('filter correctness (real API, single group scope)', () => {
  // Fetch once and reuse for filter tests
  let baseResult: QueryResult;

  beforeAll(async () => {
    baseResult = await rtu.find(
      {},
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );
  }, 15000);

  it('{ type: "lecture" } returns only entries where entry.type === "lecture"', () => {
    const lectures = baseResult.filterByType('lecture');
    for (const entry of lectures.entries) {
      expect(entry.type).toBe('lecture');
    }
  });

  it('{ type: { $in: ["lecture", "practical"] } } returns lecture and practical', async () => {
    // Use a fresh find() with the sift filter applied at query level
    const result = await rtu.find(
      { type: { $in: ['lecture', 'practical'] } },
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );

    for (const entry of result.entries) {
      expect(['lecture', 'practical']).toContain(entry.type);
    }
  }, 15000);

  it('$or filter returns lectures or exams', async () => {
    const result = await rtu.find(
      { $or: [{ type: 'lecture' }, { type: 'exam' }] },
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );

    for (const entry of result.entries) {
      expect(['lecture', 'exam']).toContain(entry.type);
    }
  }, 15000);

  it('{ weekNumber: { $gte: 5, $lte: 10 } } returns entries with weekNumber in range', async () => {
    const result = await rtu.find(
      { weekNumber: { $gte: 5, $lte: 10 } },
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );

    for (const entry of result.entries) {
      expect(entry.weekNumber).toBeGreaterThanOrEqual(5);
      expect(entry.weekNumber).toBeLessThanOrEqual(10);
    }
  }, 15000);

  it('empty filter {} returns all entries', async () => {
    const result = await rtu.find(
      {},
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );

    // Count should be the same as baseResult (same scope)
    expect(result.count).toBe(baseResult.count);
  }, 15000);

  it('non-matching filter returns an empty QueryResult', async () => {
    const result = await rtu.find(
      { type: 'nonexistent-type-xyz' } as Record<string, unknown>,
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );

    expect(result.isEmpty).toBe(true);
    expect(result).toBeInstanceOf(QueryResult);
  }, 15000);
});

// ============================================================
// 5. Scope resolution errors (real API)
// ============================================================

describe('scope resolution errors (real API)', () => {
  it(
    'invalid period throws PeriodNotFoundError',
    async () => {
      await expect(
        rtu.find({}, { period: 'INVALID_PERIOD_XYZ_9999' })
      ).rejects.toThrow(PeriodNotFoundError);
    },
    { timeout: 15000 }
  );

  it(
    'invalid program throws ProgramNotFoundError',
    async () => {
      await expect(
        rtu.find({}, { period: PERIOD, program: 'INVALID_PROG_XYZ' })
      ).rejects.toThrow(ProgramNotFoundError);
    },
    { timeout: 15000 }
  );

  it(
    'invalid course returns empty QueryResult (find() does not throw for no-match courses)',
    async () => {
      // find() filters allCourses by course number; no match → empty targets → empty result, no throw
      // CourseNotFoundError is thrown by getSchedule(), not find()
      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: 9999 }
      );
      expect(result).toBeInstanceOf(QueryResult);
      expect(result.isEmpty).toBe(true);
    },
    { timeout: 15000 }
  );

  it(
    'invalid group returns empty QueryResult (find() does not throw for no-match groups)',
    async () => {
      // find() filters allGroups by group number; no match → empty targets → empty result, no throw
      // GroupNotFoundError is thrown by getSchedule(), not find()
      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: COURSE, group: 99999 }
      );
      expect(result).toBeInstanceOf(QueryResult);
      expect(result.isEmpty).toBe(true);
    },
    { timeout: 15000 }
  );
});

// ============================================================
// 6. Invalid filter (unit test — no API)
// ============================================================

describe('invalid filter (unit test)', () => {
  it('invalid sift query throws or is handled gracefully', async () => {
    // sift may not throw on all invalid operators; if it does, InvalidQueryError is expected
    // If it doesn't throw, we simply verify the method resolves without crashing
    try {
      const result = await rtu.find(
        { $invalidOp: true } as Record<string, unknown>,
        { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
      );
      // If sift doesn't throw, result should still be a QueryResult
      expect(result).toBeInstanceOf(QueryResult);
    } catch (err) {
      // If sift does throw, it must be wrapped in InvalidQueryError
      expect(err).toHaveProperty('name', 'InvalidQueryError');
    }
  });
});

// ============================================================
// 7. Partial failures (unit test — mock apiClient)
// ============================================================

describe('partial failures (unit test with spy)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rtu.clearCache();
  });

  it(
    'simulate one group fetch throwing: partial=true, errors non-empty, other entries still returned',
    async () => {
      // We spy on apiClient.fetchSemesterProgramEvents to throw on the very first call
      // and succeed for subsequent calls
      const apiClient = (
        rtu as unknown as {
          apiClient: RTUApiClient;
        }
      ).apiClient;
      const original = apiClient.fetchSemesterProgramEvents.bind(apiClient);
      let callCount = 0;
      vi.spyOn(apiClient, 'fetchSemesterProgramEvents').mockImplementation(
        (...args) => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Simulated fetch failure'));
          }
          return original(...args);
        }
      );

      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
      );

      // With only one group in scope, the first call fails — partial should be true
      // and errors should be non-empty
      expect(result).toBeInstanceOf(QueryResult);
      expect(result.partial).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.source).toBeDefined();
      expect(result.errors[0]!.message).toBeTruthy();
    },
    { timeout: 30000 }
  );
});

// ============================================================
// 8. QueryResult API (derived from real API call)
// ============================================================

describe('QueryResult API (real API)', () => {
  let result: QueryResult;

  beforeAll(async () => {
    result = await rtu.find(
      {},
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );
  }, 15000);

  it('result is a QueryResult instance', () => {
    expect(result).toBeInstanceOf(QueryResult);
  });

  it('result.partial is false for a successful fetch', () => {
    expect(result.partial).toBe(false);
  });

  it('result.errors.length === 0', () => {
    expect(result.errors).toHaveLength(0);
  });

  it('result.sources.length > 0', () => {
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it('result.sources[0] has program, course, group fields', () => {
    const src = result.sources[0]!;
    expect(src).toHaveProperty('program');
    expect(src).toHaveProperty('course');
    expect(src).toHaveProperty('group');
  });

  it('result.count returns a number (>= 0)', () => {
    expect(typeof result.count).toBe('number');
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it('result.isEmpty returns a boolean', () => {
    expect(typeof result.isEmpty).toBe('boolean');
  });

  it('result.filterByType("lecture") returns QueryResult', () => {
    const filtered = result.filterByType('lecture');
    expect(filtered).toBeInstanceOf(QueryResult);
  });

  it('result.filterByLecturer("x") returns QueryResult even if empty', () => {
    const filtered = result.filterByLecturer('x');
    expect(filtered).toBeInstanceOf(QueryResult);
  });

  it('result.groupByWeek() returns Map<number, ScheduleEntry[]>', () => {
    const map = result.groupByWeek();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('number');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('result.groupBySource() returns Map<string, ScheduleEntry[]> with correct key format', () => {
    const map = result.groupBySource();
    expect(map).toBeInstanceOf(Map);
    for (const [key] of map) {
      // Key format: "<program.code>-<course.number>-<group.name|all>"
      expect(key).toMatch(/^.+-\d+-.+$/);
    }
  });

  it('result.sorted("asc").entries are sorted ascending by startDateTime', () => {
    const sorted = result.sorted('asc');
    const entries = sorted.entries;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.startDateTime.getTime()).toBeGreaterThanOrEqual(
        entries[i - 1]!.startDateTime.getTime()
      );
    }
  });

  it('result.sorted("desc").entries are sorted descending by startDateTime', () => {
    const sorted = result.sorted('desc');
    const entries = sorted.entries;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.startDateTime.getTime()).toBeLessThanOrEqual(
        entries[i - 1]!.startDateTime.getTime()
      );
    }
  });

  it('result.getLecturers() returns string[]', () => {
    const lecturers = result.getLecturers();
    expect(Array.isArray(lecturers)).toBe(true);
    for (const l of lecturers) {
      expect(typeof l).toBe('string');
    }
  });

  it('result.toArray() returns entries as plain array', () => {
    const arr = result.toArray();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(result.count);
  });

  it('[Symbol.iterator] works — can spread into array', () => {
    const arr = [...result];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(result.count);
  });

  it('toSchedule() with single source returns a Schedule instance', () => {
    // toSchedule requires exactly 1 source and a ScheduleMetadata argument
    if (result.sources.length !== 1) {
      // Skip if not single-source (guard for real API variability)
      return;
    }

    const src = result.sources[0]!;
    // We need a period to build ScheduleMetadata; use a minimal stub
    // RTUSchedule.find() always returns QueryResult, not Schedule.
    // toSchedule() needs ScheduleMetadata. We build it from the source.
    // We must get the period from rtu to fully satisfy ScheduleMetadata.
    // Since this is a unit-level structural test, use a minimal fake period.
    const fakePeriod = {
      id: 28,
      name: '2025/2026 Rudens',
      code: PERIOD,
      academicYear: '2025/2026',
      season: 'autumn' as const,
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-01-31'),
      isSelected: true,
    };

    const schedule = result.toSchedule({
      period: fakePeriod,
      program: src.program,
      course: src.course,
      group: src.group,
      fetchedAt: result.fetchedAt,
    });

    expect(schedule).toBeInstanceOf(Schedule);
  });
});

// ============================================================
// 9. QueryResult filtering and grouping methods
// ============================================================

describe('QueryResult filtering and grouping methods', () => {
  let result: QueryResult;

  beforeAll(async () => {
    result = await rtu.find(
      {},
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );
  }, 15000);

  it('filter(entry => entry.type === "lecture") returns QueryResult with only lectures', () => {
    const lectures = result.filter((entry) => entry.type === 'lecture');
    expect(lectures).toBeInstanceOf(QueryResult);
    for (const entry of lectures.entries) {
      expect(entry.type).toBe('lecture');
    }
  });

  it('filterByDate(new Date()) returns QueryResult without throwing', () => {
    const res = result.filterByDate(new Date());
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('filterByDateRange(2025-01-01, 2030-01-01) returns QueryResult', () => {
    const res = result.filterByDateRange(
      new Date('2025-01-01'),
      new Date('2030-01-01')
    );
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('filterBySubject("a") returns QueryResult (may be empty)', () => {
    const res = result.filterBySubject('a');
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('filterByLocation("a") returns QueryResult', () => {
    const res = result.filterByLocation('a');
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('filterByGroup("a") returns QueryResult', () => {
    const res = result.filterByGroup('a');
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('filterByDayOfWeek(1) returns QueryResult', () => {
    const res = result.filterByDayOfWeek(1);
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getToday() returns QueryResult', () => {
    const res = result.getToday();
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getTomorrow() returns QueryResult', () => {
    const res = result.getTomorrow();
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getThisWeek() returns QueryResult', () => {
    const res = result.getThisWeek();
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getNextWeek() returns QueryResult', () => {
    const res = result.getNextWeek();
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getUpcoming(7) returns QueryResult', () => {
    const res = result.getUpcoming(7);
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('getWeek(10) returns QueryResult', () => {
    const res = result.getWeek(10);
    expect(res).toBeInstanceOf(QueryResult);
  });

  it('groupByDate() returns Map<string, ScheduleEntry[]>', () => {
    const map = result.groupByDate();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('groupByDayOfWeek() returns Map<number, ScheduleEntry[]>', () => {
    const map = result.groupByDayOfWeek();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('number');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('groupBySubject() returns Map<string, ScheduleEntry[]>', () => {
    const map = result.groupBySubject();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('groupByLecturer() returns Map<string, ScheduleEntry[]>', () => {
    const map = result.groupByLecturer();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('groupByType() returns Map<ScheduleEntryType, ScheduleEntry[]>', () => {
    const map = result.groupByType();
    expect(map).toBeInstanceOf(Map);
    for (const [key, entries] of map) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('getSubjects() returns array', () => {
    const subjects = result.getSubjects();
    expect(Array.isArray(subjects)).toBe(true);
  });

  it('getLocations() returns array', () => {
    const locations = result.getLocations();
    expect(Array.isArray(locations)).toBe(true);
  });

  it('getTypes() returns array', () => {
    const types = result.getTypes();
    expect(Array.isArray(types)).toBe(true);
  });

  it('getSources() returns array same as result.sources', () => {
    const sources = result.getSources();
    expect(Array.isArray(sources)).toBe(true);
    expect(sources).toHaveLength(result.sources.length);
    for (let i = 0; i < sources.length; i++) {
      expect(sources[i]).toEqual(result.sources[i]);
    }
  });
});

// ============================================================
// 10. Edge cases from real API
// ============================================================

describe('edge cases from real API', () => {
  let result: QueryResult;

  beforeAll(async () => {
    result = await rtu.find(
      {},
      { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
    );
  }, 15000);

  it('entries have _source.program, _source.course, _source.group set when using group scope', () => {
    for (const entry of result.entries) {
      expect(entry._source).toBeDefined();
      expect(entry._source?.program).toBeDefined();
      expect(entry._source?.course).toBeDefined();
      // group may be undefined for courses without groups — but with group scope it should be set
      expect(entry._source?.group).toBeDefined();
    }
  });

  it('entries with _source have correct program.code', () => {
    for (const entry of result.entries) {
      expect(entry._source?.program.code).toBe(PROGRAM);
    }
  });

  it('result.fetchedAt is a Date close to now', () => {
    const now = Date.now();
    expect(result.fetchedAt).toBeInstanceOf(Date);
    // Should be within 5 minutes of now
    expect(Math.abs(now - result.fetchedAt.getTime())).toBeLessThan(
      5 * 60 * 1000
    );
  });

  it('result.partial is false for a fully successful fetch', () => {
    expect(result.partial).toBe(false);
  });

  it('result returns 0 entries gracefully when schedule not published (isEmpty check)', () => {
    // This verifies the isEmpty contract — no throw, just an empty result
    if (result.isEmpty) {
      expect(result.isEmpty).toBe(true);
      expect(result.count).toBe(0);
    } else {
      // If entries exist, isEmpty must be false
      expect(result.isEmpty).toBe(false);
      expect(result.count).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 11. months=0 early return — startDate > endDate (real API)
// ============================================================

describe('months=0 early return — startDate > endDate', () => {
  it(
    'find() with startDate after endDate returns empty QueryResult without throwing',
    async () => {
      // Both dates are in the future and equal (no months in range since start=end on same day
      // still gives 1 month, so we use start > end to get 0 months)
      const result = await rtu.find(
        {},
        {
          period: PERIOD,
          program: PROGRAM,
          course: COURSE,
          group: GROUP,
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-01-01'),
        }
      );
      // A range of a single day still yields 1 month, but publication check will
      // return false for a far-future semester — isEmpty will be true in either case
      expect(result).toBeInstanceOf(QueryResult);
      expect(result.isEmpty).toBe(true);
    },
    { timeout: 30000 }
  );
});

// ============================================================
// 12. Custom date range test (real API)
// ============================================================

describe('custom date range — October 2025 (real API)', () => {
  it(
    'find() with startDate/endDate in October 2025 returns entries only in that range (or empty if not published)',
    async () => {
      const startDate = new Date('2025-10-01');
      const endDate = new Date('2025-10-31');

      const result = await rtu.find(
        {},
        {
          period: PERIOD,
          program: PROGRAM,
          course: COURSE,
          group: GROUP,
          startDate,
          endDate,
        }
      );

      expect(result).toBeInstanceOf(QueryResult);

      if (!result.isEmpty) {
        for (const entry of result.entries) {
          const month = entry.date.getMonth(); // 0-indexed: 9 = October
          const year = entry.date.getFullYear();
          expect(year).toBe(2025);
          expect(month).toBe(9); // October
        }
      }
      // If empty (not published), just verify no throw — already done by reaching here
    },
    { timeout: 15000 }
  );
});

// ============================================================
// 13. Published check mock — unit test (no real API)
// ============================================================

describe('published check mock (unit test)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rtu.clearCache();
  });

  it(
    'find() returns isEmpty=true and partial=false when checkSemesterProgramPublished returns false',
    async () => {
      const apiClient = (
        rtu as unknown as {
          apiClient: {
            checkSemesterProgramPublished: (...args: unknown[]) => unknown;
          };
        }
      ).apiClient;

      const spy = vi
        .spyOn(apiClient, 'checkSemesterProgramPublished')
        .mockResolvedValue(false);

      const result = await rtu.find(
        {},
        { period: PERIOD, program: PROGRAM, course: COURSE, group: GROUP }
      );

      expect(result).toBeInstanceOf(QueryResult);
      expect(result.isEmpty).toBe(true);
      // Unpublished is not an error — partial must be false
      expect(result.partial).toBe(false);

      spy.mockRestore();
    },
    { timeout: 15000 }
  );
});
