import { Injectable } from '@nestjs/common';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { SessionsQueryParams, DriversQueryParams } from '../../common/interfaces/query-params.interface';
import { F1TransformationsUtil } from '../../common/utils/f1-transformations.util';

@Injectable()
export class SessionsService extends BaseF1Service {
  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  async getSessions(country?: string, year?: string) {
    return this.executeWithErrorHandling(async () => {
      const params: SessionsQueryParams = {};
      if (country) params.country_name = country;
      if (year) params.year = year;

      const sessions = await this.cachedOpenf1Client.fetchSessions(params);
      
      return sessions;
    }, 'fetch sessions', { country, year });
  }

  async getSessionDrivers(sessionKey: number) {
    return this.executeWithErrorHandling(async () => {
      const params: DriversQueryParams = { session_key: sessionKey };
      const drivers = await this.cachedOpenf1Client.fetchDrivers(params);
      
      // Transform drivers using shared utility
      return drivers.map(driver => F1TransformationsUtil.transformDriverData(driver));
    }, 'fetch session drivers', { sessionKey });
  }

  async startReplay(sessionKey: number) {
    return this.executeWithErrorHandling(async () => {
      // Validate session exists and get drivers
      const drivers = await this.getSessionDrivers(sessionKey);
      
      // Use base class validation method
      if (drivers.length === 0) {
        await this.validateSession(sessionKey, 'replay data');
      }

      // Pre-load all replay data into cache
      const replayData = await this.cachedOpenf1Client.preloadReplayData(sessionKey);
      
      return this.createResponse(sessionKey, {
        cachingStatus: 'completed',
        availableData: ['drivers', 'laps', 'intervals', 'car_data', 'race_control', 'stints'],
        driverCount: drivers.length,
        dataStats: {
          lapsCount: replayData.laps.length,
          intervalsCount: replayData.intervals.length,
          stintsCount: replayData.stints.length
        },
        drivers: drivers  // Already transformed in getSessionDrivers
      });
    }, 'start replay session', { sessionKey });
  }
}