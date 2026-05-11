/**
 * Base error class for RTUSchedule errors
 */
export class RTUScheduleError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RTUScheduleError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Error thrown when a study period is not found
 */
export class PeriodNotFoundError extends RTUScheduleError {
  constructor(public input: number | string) {
    super(`Study period not found: "${input}"`);
    this.name = 'PeriodNotFoundError';
  }
}

/**
 * Error thrown when a study program is not found
 */
export class ProgramNotFoundError extends RTUScheduleError {
  constructor(public input: number | string) {
    super(`Study program not found: "${input}"`);
    this.name = 'ProgramNotFoundError';
  }
}

/**
 * Error thrown when a course is not found
 */
export class CourseNotFoundError extends RTUScheduleError {
  constructor(public courseNumber: number) {
    super(`Course ${courseNumber} not found`);
    this.name = 'CourseNotFoundError';
  }
}

/**
 * Error thrown when a group is not found
 */
export class GroupNotFoundError extends RTUScheduleError {
  constructor(public groupNumber: number) {
    super(`Group ${groupNumber} not found`);
    this.name = 'GroupNotFoundError';
  }
}

/**
 * Error thrown when a schedule is not published
 */
export class ScheduleNotPublishedError extends RTUScheduleError {
  constructor() {
    super('Schedule is not yet published');
    this.name = 'ScheduleNotPublishedError';
  }
}

/**
 * Error thrown when discovery of RTU data fails
 */
export class DiscoveryError extends RTUScheduleError {
  constructor(message: string, cause?: Error) {
    super(`Failed to discover RTU data: ${message}`, cause);
    this.name = 'DiscoveryError';
  }
}

/**
 * Error thrown when schedule options are invalid
 */
export class InvalidOptionsError extends RTUScheduleError {
  constructor(message: string) {
    super(`Invalid schedule options: ${message}`);
    this.name = 'InvalidOptionsError';
  }
}

/**
 * Error thrown when a query is invalid
 */
export class InvalidQueryError extends RTUScheduleError {
  constructor(message: string) {
    super(`Invalid query: ${message}`);
    this.name = 'InvalidQueryError';
  }
}
