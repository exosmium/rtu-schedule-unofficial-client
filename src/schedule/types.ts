import type { SemesterEvent } from '../types.js';

/**
 * Study Faculty information
 */
export interface StudyFaculty {
  name: string;
  code: string;
}

/**
 * Study Period (semester) with rich metadata
 */
export interface StudyPeriod {
  id: number;
  name: string;
  code: string;
  academicYear: string;
  season: 'autumn' | 'spring' | 'summer';
  startDate: Date;
  endDate: Date;
  isSelected: boolean;
}

/**
 * Study Program with faculty information
 */
export interface StudyProgram {
  id: number;
  name: string;
  code: string;
  fullName: string;
  faculty: StudyFaculty;
  tokens: string;
}

/**
 * Study Course (year of study)
 */
export interface StudyCourse {
  id: number;
  number: number;
  name: string;
}

/**
 * Study Group within a course
 */
export interface StudyGroup {
  id: number;
  number: number;
  name: string;
  studentCount?: number;
  semesterProgramId: number;
}

/**
 * Schedule entry types
 */
export type ScheduleEntryType =
  | 'lecture'
  | 'practical'
  | 'lab'
  | 'seminar'
  | 'consultation'
  | 'exam'
  | 'test'
  | 'other';

/**
 * Subject information in a schedule entry
 */
export interface ScheduleSubject {
  name: string;
  code: string;
}

/**
 * Query source information
 */
export interface QuerySource {
  program: StudyProgram;
  course: StudyCourse;
  group: StudyGroup | undefined;
}

/**
 * Query error with source context
 */
export interface QueryError {
  source: QuerySource;
  message: string;
  cause?: Error;
}

/**
 * Query scope for finding schedules
 */
export interface QueryScope {
  period?: number | string;
  program?: number | string;
  course?: number;
  group?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  concurrency?: number;
}

/**
 * Rich schedule entry with parsed data
 */
export interface ScheduleEntry {
  id: number;
  subject: ScheduleSubject;
  date: Date;
  startTime: string;
  endTime: string;
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;
  location: string;
  building: string | undefined;
  room: string | undefined;
  lecturer: string;
  lecturers: string[];
  type: ScheduleEntryType;
  typeRaw: string;
  group: string;
  groups: string[];
  weekNumber: number;
  dayOfWeek: number;
  dayName: string;
  _raw: SemesterEvent;
  _source?: QuerySource;
}

/**
 * Options for getSchedule method
 */
export interface GetScheduleOptions {
  period?: string;
  periodId?: number;
  program?: string;
  programId?: number;
  course: number;
  group?: number;
  startDate?: Date | string;
  endDate?: Date | string;
}

/**
 * RTUSchedule configuration options
 */
export interface RTUScheduleConfig {
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  cacheTimeout?: number;
  discoveryCacheTimeout?: number;
  autoDiscover?: boolean;
}

/**
 * Schedule metadata for context
 */
export interface ScheduleMetadata {
  period: StudyPeriod;
  program: StudyProgram;
  course: StudyCourse;
  group: StudyGroup | undefined;
  fetchedAt: Date;
}

/**
 * Cache entry with timestamp
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
