// Main class
export { RTUSchedule } from './rtu-schedule.js';
export { Schedule } from './schedule-result.js';
export { QueryResult } from './query-result.js';

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
} from './types.js';

// Errors
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
} from './errors.js';

// Internal services (for advanced usage)
export { DiscoveryService } from './discovery.js';
export { Resolver } from './resolver.js';
