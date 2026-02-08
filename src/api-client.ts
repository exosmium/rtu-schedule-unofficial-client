import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type {
  Course,
  CoursesByProgramParams,
  Group,
  GroupsByCourseParams,
  RTUApiConfig,
  SemesterEvent,
  SemesterProgramEventsParams,
  Subject,
} from './types.js';

/**
 * RTU API Client for making POST requests to backend endpoints
 * All methods in this class fetch live data from the RTU scheduling system
 */
export class RTUApiClient {
  private client: AxiosInstance;
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly cacheTimeout: number;

  constructor(config: RTUApiConfig = {}) {
    this.cacheTimeout = config.cacheTimeout ?? 5 * 60 * 1000; // 5 minutes default

    this.client = axios.create({
      baseURL: config.baseUrl ?? 'https://nodarbibas.rtu.lv',
      timeout: config.timeout ?? 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent':
          config.userAgent ??
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.118 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Origin: 'https://nodarbibas.rtu.lv',
        Referer: 'https://nodarbibas.rtu.lv/?lang=lv',
      },
    });
  }

  /**
   * Fetch semester program events for a specific month and year
   * @param params Parameters including semesterProgramId, year, and month
   * @returns Array of semester events
   */
  async fetchSemesterProgramEvents(
    params: SemesterProgramEventsParams
  ): Promise<SemesterEvent[]> {
    this.validateSemesterProgramEventsParams(params);

    const cacheKey = `events_${params.semesterProgramId}_${params.year}_${params.month}`;
    const cached = this.getFromCache<SemesterEvent[]>(cacheKey);
    if (cached) return cached;

    try {
      const response: AxiosResponse = await this.client.post(
        '/getSemesterProgEventList',
        new URLSearchParams({
          semesterProgramId: params.semesterProgramId.toString(),
          year: params.year.toString(),
          month: params.month.toString(),
        })
      );

      if (response.data == null) {
        throw new Error('Invalid response data');
      }

      const events = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, events);
      return events as SemesterEvent[];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch subjects for a semester program
   * @param semesterProgramId The ID of the semester program
   * @returns Array of subjects
   */
  async fetchSemesterProgramSubjects(
    semesterProgramId: number
  ): Promise<Subject[]> {
    if (!semesterProgramId || semesterProgramId <= 0) {
      throw new Error('Invalid semesterProgramId');
    }

    const cacheKey = `subjects_${semesterProgramId}`;
    const cached = this.getFromCache<Subject[]>(cacheKey);
    if (cached) return cached;

    try {
      const response: AxiosResponse = await this.client.post(
        '/getSemProgSubjects',
        new URLSearchParams({
          semesterProgramId: semesterProgramId.toString(),
        })
      );

      if (response.data == null) {
        throw new Error('Invalid response data');
      }

      const subjects = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, subjects);
      return subjects as Subject[];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if a semester program schedule is published
   * @param semesterProgramId The ID of the semester program
   * @returns Boolean indicating if the program is published
   */
  async checkSemesterProgramPublished(
    semesterProgramId: number
  ): Promise<boolean> {
    if (!semesterProgramId || semesterProgramId <= 0) {
      throw new Error('Invalid semesterProgramId');
    }

    const cacheKey = `published_${semesterProgramId}`;
    const cached = this.getFromCache<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const response: AxiosResponse = await this.client.post(
        '/isSemesterProgramPublished',
        new URLSearchParams({
          semesterProgramId: semesterProgramId.toString(),
        })
      );

      const published = response.data != null ? Boolean(response.data) : false;

      this.setCache(cacheKey, published);
      return published;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Find groups associated with a specific course
   * @param params Parameters including courseId, semesterId, and programId
   * @returns Array of groups
   */
  async findGroupsByCourse(params: GroupsByCourseParams): Promise<Group[]> {
    this.validateGroupsByCourseParams(params);

    const cacheKey = `groups_${params.courseId}_${params.semesterId}_${params.programId}`;
    const cached = this.getFromCache<Group[]>(cacheKey);
    if (cached) return cached;

    try {
      const response: AxiosResponse = await this.client.post(
        '/findGroupByCourseId',
        new URLSearchParams({
          courseId: params.courseId.toString(),
          semesterId: params.semesterId.toString(),
          programId: params.programId.toString(),
        })
      );

      if (response.data == null) {
        throw new Error('Invalid response data');
      }

      const groups = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, groups);
      return groups as Group[];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Find courses available in a specific program
   * @param params Parameters including semesterId and programId
   * @returns Array of courses
   */
  async findCoursesByProgram(
    params: CoursesByProgramParams
  ): Promise<Course[]> {
    this.validateCoursesByProgramParams(params);

    const cacheKey = `courses_${params.semesterId}_${params.programId}`;
    const cached = this.getFromCache<Course[]>(cacheKey);
    if (cached) return cached;

    try {
      const response: AxiosResponse = await this.client.post(
        '/findCourseByProgramId',
        new URLSearchParams({
          semesterId: params.semesterId.toString(),
          programId: params.programId.toString(),
        })
      );

      if (response.data == null) {
        throw new Error('Invalid response data');
      }

      const courses = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, courses);
      return courses as Course[];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  // Private helper methods

  private validateSemesterProgramEventsParams(
    params: SemesterProgramEventsParams
  ): void {
    if (!params.semesterProgramId || params.semesterProgramId <= 0) {
      throw new Error('Invalid semesterProgramId');
    }
    if (!params.year || params.year < 2000 || params.year > 3000) {
      throw new Error('Invalid year');
    }
    if (!params.month || params.month < 1 || params.month > 12) {
      throw new Error('Invalid month');
    }
  }

  private validateGroupsByCourseParams(params: GroupsByCourseParams): void {
    if (!params.courseId || params.courseId <= 0) {
      throw new Error('Invalid courseId');
    }
    if (!params.semesterId || params.semesterId <= 0) {
      throw new Error('Invalid semesterId');
    }
    if (!params.programId || params.programId <= 0) {
      throw new Error('Invalid programId');
    }
  }

  private validateCoursesByProgramParams(params: CoursesByProgramParams): void {
    if (!params.semesterId || params.semesterId <= 0) {
      throw new Error('Invalid semesterId');
    }
    if (!params.programId || params.programId <= 0) {
      throw new Error('Invalid programId');
    }
  }

  private getFromCache<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data as T;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired entry
    }
    return undefined;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}
