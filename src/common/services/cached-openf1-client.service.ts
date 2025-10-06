import { Injectable, Logger } from '@nestjs/common';
import { OpenF1ClientService } from './openf1-client.service';
import { CacheService } from './cache.service';
import {
  OpenF1Session,
  OpenF1Driver,
  OpenF1Lap,
  OpenF1CarData,
  OpenF1Interval,
  OpenF1RaceControl,
  OpenF1Stint,
} from '../interfaces/openf1.interface';
import {
  SessionsQueryParams,
  DriversQueryParams,
  LapsQueryParams,
  CarDataQueryParams,
  IntervalsQueryParams,
  RaceControlQueryParams,
  StintsQueryParams,
} from '../interfaces/query-params.interface';

@Injectable()
export class CachedOpenF1ClientService {
  private readonly logger = new Logger(CachedOpenF1ClientService.name);

  constructor(
    private readonly openf1Client: OpenF1ClientService,
    private readonly cacheService: CacheService,
  ) {}

  async fetchSessions(
    params: SessionsQueryParams = {},
  ): Promise<OpenF1Session[]> {
    // Generate cache key based on parameters
    const cacheKey = this.generateSessionsCacheKey(params);

    // Try to get from cache first
    const cachedData = await this.cacheService.get<OpenF1Session[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(`Returning cached sessions for key: ${cacheKey}`);
      return cachedData;
    }

    // Fetch from API if not in cache
    this.logger.debug(`Fetching sessions from API for key: ${cacheKey}`);
    const sessions = await this.openf1Client.fetchSessions(params);

    // Cache the result with longer TTL since sessions don't change often
    await this.cacheService.set(cacheKey, sessions, { ttl: 3600 }); // 1 hour

    return sessions;
  }

  async fetchDrivers(params: DriversQueryParams): Promise<OpenF1Driver[]> {
    const cacheKey = this.cacheService.generateSessionKey(
      params.session_key,
      'drivers',
    );

    const cachedData = await this.cacheService.get<OpenF1Driver[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(
        `Returning cached drivers for session ${params.session_key}`,
      );
      return cachedData;
    }

    this.logger.debug(
      `Fetching drivers from API for session ${params.session_key}`,
    );
    const drivers = await this.openf1Client.fetchDrivers(params);

    // Cache drivers with medium TTL
    await this.cacheService.set(cacheKey, drivers, { ttl: 1800 }); // 30 minutes

    return drivers;
  }

  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]> {
    const cacheKey = this.generateLapsCacheKey(params);

    const cachedData = await this.cacheService.get<OpenF1Lap[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(`Returning cached laps for key: ${cacheKey}`);
      return cachedData;
    }

    this.logger.debug(`Fetching laps from API for key: ${cacheKey}`);
    const laps = await this.openf1Client.fetchLaps(params);

    // Cache laps with medium TTL
    await this.cacheService.set(cacheKey, laps, { ttl: 900 }); // 15 minutes

    return laps;
  }

  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]> {
    const cacheKey = this.cacheService.generateDriverKey(
      params.session_key,
      params.driver_number,
      'telemetry',
    );

    const cachedData = await this.cacheService.get<OpenF1CarData[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(
        `Returning cached car data for driver ${params.driver_number}`,
      );
      return cachedData;
    }

    this.logger.debug(
      `Fetching car data from API for driver ${params.driver_number}`,
    );
    const carData = await this.openf1Client.fetchCarData(params);

    // Cache telemetry with shorter TTL as it's large data
    await this.cacheService.set(cacheKey, carData, { ttl: 600 }); // 10 minutes

    return carData;
  }

  async fetchIntervals(
    params: IntervalsQueryParams,
  ): Promise<OpenF1Interval[]> {
    const cacheKey = this.cacheService.generateSessionKey(
      params.session_key,
      'intervals',
    );

    const cachedData = await this.cacheService.get<OpenF1Interval[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(
        `Returning cached intervals for session ${params.session_key}`,
      );
      return cachedData;
    }

    this.logger.debug(
      `Fetching intervals from API for session ${params.session_key}`,
    );
    const intervals = await this.openf1Client.fetchIntervals(params);

    // Cache intervals with short TTL (live-like data)
    await this.cacheService.set(cacheKey, intervals, { ttl: 300 }); // 5 minutes

    return intervals;
  }

  async fetchRaceControl(
    params: RaceControlQueryParams,
  ): Promise<OpenF1RaceControl[]> {
    const cacheKey = this.generateRaceControlCacheKey(params);

    const cachedData =
      await this.cacheService.get<OpenF1RaceControl[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(`Returning cached race control for key: ${cacheKey}`);
      return cachedData;
    }

    this.logger.debug(`Fetching race control from API for key: ${cacheKey}`);
    const raceControl = await this.openf1Client.fetchRaceControl(params);

    // Cache race control with medium TTL
    await this.cacheService.set(cacheKey, raceControl, { ttl: 600 }); // 10 minutes

    return raceControl;
  }

  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]> {
    const cacheKey = this.cacheService.generateSessionKey(
      params.session_key,
      'stints',
    );

    const cachedData = await this.cacheService.get<OpenF1Stint[]>(cacheKey);
    if (cachedData) {
      this.logger.debug(
        `Returning cached stints for session ${params.session_key}`,
      );
      return cachedData;
    }

    this.logger.debug(
      `Fetching stints from API for session ${params.session_key}`,
    );
    const stints = await this.openf1Client.fetchStints(params);

    // Cache stints with longer TTL (doesn't change much)
    await this.cacheService.set(cacheKey, stints, { ttl: 1800 }); // 30 minutes

    return stints;
  }

  // Replay-specific caching methods
  async preloadReplayData(sessionKey: number): Promise<{
    drivers: OpenF1Driver[];
    laps: OpenF1Lap[];
    intervals: OpenF1Interval[];
    stints: OpenF1Stint[];
  }> {
    this.logger.log(`Preloading replay data for session ${sessionKey}`);

    // Load all essential data in parallel
    const [drivers, laps, intervals, stints] = await Promise.all([
      this.fetchDrivers({ session_key: sessionKey }),
      this.fetchLaps({ session_key: sessionKey }),
      this.fetchIntervals({ session_key: sessionKey }),
      this.fetchStints({ session_key: sessionKey }),
    ]);

    this.logger.log(
      `Preloaded replay data: ${drivers.length} drivers, ${laps.length} laps, ${intervals.length} intervals, ${stints.length} stints`,
    );

    return { drivers, laps, intervals, stints };
  }

  async clearSessionCache(sessionKey: number): Promise<void> {
    await this.cacheService.clearSessionCache(sessionKey);
  }

  // Cache key generators
  private generateSessionsCacheKey(params: SessionsQueryParams): string {
    const keyParts = ['sessions'];

    if (params.country_name) keyParts.push(`country:${params.country_name}`);
    if (params.year) keyParts.push(`year:${params.year}`);
    if (params.session_key) keyParts.push(`key:${params.session_key}`);
    if (params.session_name) keyParts.push(`name:${params.session_name}`);

    return keyParts.join(':');
  }

  private generateLapsCacheKey(params: LapsQueryParams): string {
    if (params.lap_number) {
      return this.cacheService.generateLapKey(
        params.session_key,
        params.lap_number,
      );
    }

    if (params.driver_number) {
      return this.cacheService.generateDriverKey(
        params.session_key,
        params.driver_number,
        'laps',
      );
    }

    return this.cacheService.generateLapKey(params.session_key);
  }

  private generateRaceControlCacheKey(params: RaceControlQueryParams): string {
    const keyParts = ['race_control'];

    if (params.session_key) keyParts.push(`session:${params.session_key}`);
    if (params.date) keyParts.push(`date:${params.date}`);
    if (params.category) keyParts.push(`cat:${params.category}`);
    if (params.flag) keyParts.push(`flag:${params.flag}`);

    return keyParts.join(':');
  }

  // Cache statistics
  async getCacheStats(): Promise<any> {
    return this.cacheService.getStats();
  }
}
