import { Injectable } from '@nestjs/common';
import { OpenF1ClientService } from './openf1-client.service';
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
  constructor(private readonly openf1Client: OpenF1ClientService) {}

  async fetchSessions(
    params: SessionsQueryParams = {},
  ): Promise<OpenF1Session[]> {
    return this.openf1Client.fetchSessions(params);
  }

  async fetchDrivers(params: DriversQueryParams): Promise<OpenF1Driver[]> {
    return this.openf1Client.fetchDrivers(params);
  }

  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]> {
    return this.openf1Client.fetchLaps(params);
  }

  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]> {
    return this.openf1Client.fetchCarData(params);
  }

  async fetchIntervals(
    params: IntervalsQueryParams,
  ): Promise<OpenF1Interval[]> {
    return this.openf1Client.fetchIntervals(params);
  }

  async fetchRaceControl(
    params: RaceControlQueryParams,
  ): Promise<OpenF1RaceControl[]> {
    return this.openf1Client.fetchRaceControl(params);
  }

  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]> {
    return this.openf1Client.fetchStints(params);
  }

  async preloadReplayData(sessionKey: number): Promise<{
    drivers: OpenF1Driver[];
    laps: OpenF1Lap[];
    intervals: OpenF1Interval[];
    stints: OpenF1Stint[];
  }> {
    const [drivers, laps, intervals, stints] = await Promise.all([
      this.fetchDrivers({ session_key: sessionKey }),
      this.fetchLaps({ session_key: sessionKey }),
      this.fetchIntervals({ session_key: sessionKey }),
      this.fetchStints({ session_key: sessionKey }),
    ]);
    return { drivers, laps, intervals, stints };
  }
}
