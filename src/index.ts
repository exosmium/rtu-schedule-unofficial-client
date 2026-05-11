// Main exports for the RTU Nodarbibas API library

import { RTUApiClient } from './api-client.js';
import { RTUHtmlParser } from './html-parser.js';

// ========== LOW-LEVEL API (backward compatible) ==========

// Classes
export { RTUApiClient } from './api-client.js';
export { RTUHtmlParser } from './html-parser.js';

// Types
export type {
  BreadcrumbItem,
  Course,
  CoursesByProgramParams,
  Faculty,
  FacultyInfo,
  Group,
  GroupsByCourseParams,
  PageMetadata,
  Pagination,
  Program,
  RTUApiConfig,
  ScheduleEvent,
  Semester,
  SemesterEvent,
  SemesterMetadata,
  SemesterProgramEventsParams,
  Subject,
  TimeSlot,
} from './types.js';

// Default instances
export const apiClient = new RTUApiClient();
export const htmlParser = new RTUHtmlParser();

// ========== HIGH-LEVEL API (new user-friendly interface) ==========

// Main class
export { RTUSchedule, Schedule, QueryResult } from './schedule/index.js';

// Types
export type {
  StudyPeriod,
  StudyProgram,
  StudyFaculty,
  StudyCourse,
  StudyGroup,
  ScheduleEntry,
  ScheduleEntryType,
  ScheduleSubject,
  GetScheduleOptions,
  RTUScheduleConfig,
  ScheduleMetadata,
  QueryScope,
  QuerySource,
  QueryError,
} from './schedule/index.js';

// Error classes
export {
  RTUScheduleError,
  PeriodNotFoundError,
  ProgramNotFoundError,
  CourseNotFoundError,
  GroupNotFoundError,
  ScheduleNotPublishedError,
  DiscoveryError,
  InvalidOptionsError,
  InvalidQueryError,
} from './schedule/index.js';

// Advanced services (for power users)
export { DiscoveryService, Resolver } from './schedule/index.js';
