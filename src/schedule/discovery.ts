import axios from 'axios';
import { RTUHtmlParser } from '../html-parser.js';
import type { Faculty, Semester, SemesterMetadata } from '../types.js';
import type { CacheEntry, StudyPeriod, StudyProgram } from './types.js';
import { DiscoveryError } from './errors.js';
import {
  parseAcademicYear,
  parsePeriodCode,
  parseProgramName,
  parseSeason,
} from './utils.js';

const DEFAULT_BASE_URL = 'https://nodarbibas.rtu.lv';
const DEFAULT_CACHE_TIMEOUT = 60 * 60 * 1000; // 1 hour

/**
 * Service for auto-discovering periods and programs from RTU main page
 */
export class DiscoveryService {
  private htmlParser: RTUHtmlParser;
  private baseUrl: string;
  private cacheTimeout: number;
  private periodsCache: CacheEntry<StudyPeriod[]> | null = null;
  private programsCache: Map<number, CacheEntry<StudyProgram[]>> = new Map();

  constructor(
    htmlParser: RTUHtmlParser,
    options?: { baseUrl?: string; cacheTimeout?: number }
  ) {
    this.htmlParser = htmlParser;
    this.baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
    this.cacheTimeout = options?.cacheTimeout ?? DEFAULT_CACHE_TIMEOUT;
  }

  /**
   * Discover all available study periods
   */
  async discoverPeriods(): Promise<StudyPeriod[]> {
    const cached = this.getCachedPeriods();
    if (cached) return cached;

    try {
      const html = await this.fetchMainPage();
      const semesters = this.htmlParser.parseHtmlSemesters(html);
      const metadata = this.htmlParser.parseHtmlSemesterMetadata(html);

      const periods = semesters.map((s) =>
        this.transformToStudyPeriod(s, metadata)
      );

      this.periodsCache = {
        data: periods,
        timestamp: Date.now(),
      };

      return periods;
    } catch (error) {
      throw new DiscoveryError(
        'Failed to fetch periods',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Discover all programs for a specific period
   */
  async discoverPrograms(periodId: number): Promise<StudyProgram[]> {
    const cached = this.getCachedPrograms(periodId);
    if (cached) return cached;

    try {
      const html = await this.fetchMainPage(periodId);
      const faculties = this.htmlParser.parseHtmlPrograms(html);

      const programs = this.transformFacultiesToPrograms(faculties);

      this.programsCache.set(periodId, {
        data: programs,
        timestamp: Date.now(),
      });

      return programs;
    } catch (error) {
      throw new DiscoveryError(
        'Failed to fetch programs',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the currently selected (default) period
   */
  async discoverCurrentPeriod(): Promise<StudyPeriod | null> {
    const periods = await this.discoverPeriods();
    return periods.find((p) => p.isSelected) ?? periods[0] ?? null;
  }

  /**
   * Clear all discovery caches
   */
  clearCache(): void {
    this.periodsCache = null;
    this.programsCache.clear();
  }

  // Private methods

  private async fetchMainPage(semesterId?: number): Promise<string> {
    const url = new URL('/', this.baseUrl);
    url.searchParams.set('lang', 'lv');
    if (semesterId !== undefined) {
      url.searchParams.set('semester', semesterId.toString());
    }

    try {
      const response = await axios.get(url.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.118 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'lv,en;q=0.9',
        },
        timeout: 15000,
      });

      return response.data as string;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new DiscoveryError(`HTTP request failed: ${error.message}`);
      }
      throw error;
    }
  }

  private transformToStudyPeriod(
    semester: Semester,
    metadata: SemesterMetadata
  ): StudyPeriod {
    const code = parsePeriodCode(semester.name);
    const academicYear = parseAcademicYear(semester.name);
    const season = parseSeason(semester.name);

    // Use metadata dates if selected semester, otherwise calculate defaults
    let startDate: Date;
    let endDate: Date;

    if (semester.isSelected && metadata.startDate && metadata.endDate) {
      // Use actual dates from metadata for the selected semester
      startDate = new Date(metadata.startDate);
      endDate = new Date(metadata.endDate);
    } else {
      // Calculate default date ranges based on season and academic year
      const yearMatch = academicYear.match(/^(\d{4})\/(\d{4})$/);
      const startYear = yearMatch
        ? parseInt(yearMatch[1], 10)
        : new Date().getFullYear();
      const endYear = yearMatch ? parseInt(yearMatch[2], 10) : startYear + 1;

      switch (season) {
        case 'autumn':
          // Autumn semester: September to January
          startDate = new Date(startYear, 8, 1); // September 1st
          endDate = new Date(endYear, 0, 31); // January 31st
          break;
        case 'spring':
          // Spring semester: February to June
          startDate = new Date(endYear, 1, 1); // February 1st
          endDate = new Date(endYear, 5, 30); // June 30th
          break;
        case 'summer':
          // Summer semester: July to August
          startDate = new Date(endYear, 6, 1); // July 1st
          endDate = new Date(endYear, 7, 31); // August 31st
          break;
        default:
          startDate = new Date();
          endDate = new Date();
      }
    }

    return {
      id: semester.id,
      name: semester.name,
      code,
      academicYear,
      season,
      startDate,
      endDate,
      isSelected: semester.isSelected,
    };
  }

  private transformFacultiesToPrograms(faculties: Faculty[]): StudyProgram[] {
    const programs: StudyProgram[] = [];

    for (const faculty of faculties) {
      for (const program of faculty.programs) {
        programs.push({
          id: program.id,
          name: parseProgramName(program.name),
          code: program.code,
          fullName: program.name,
          faculty: {
            name: faculty.facultyName,
            code: faculty.facultyCode,
          },
          tokens: program.tokens,
        });
      }
    }

    return programs;
  }

  private getCachedPeriods(): StudyPeriod[] | null {
    if (!this.periodsCache) return null;
    if (Date.now() - this.periodsCache.timestamp > this.cacheTimeout) {
      this.periodsCache = null;
      return null;
    }
    return this.periodsCache.data;
  }

  private getCachedPrograms(periodId: number): StudyProgram[] | null {
    const cached = this.programsCache.get(periodId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.programsCache.delete(periodId);
      return null;
    }
    return cached.data;
  }
}
