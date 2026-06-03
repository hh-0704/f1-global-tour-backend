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
  OpenF1Location,
} from '../interfaces/openf1.interface';
import {
  SessionsQueryParams,
  DriversQueryParams,
  LapsQueryParams,
  CarDataQueryParams,
  IntervalsQueryParams,
  RaceControlQueryParams,
  StintsQueryParams,
  LocationQueryParams,
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

  /**
   * 한 드라이버의 레이스 윈도우 location (date 청크 페이징).
   *
   * 현재는 패스스루. plan.md 의 RDB+Redis 캐시 도입 시 키 `raw:location:{sk}:{driver}` 로 흡수.
   * ⚠ 캐싱 시 **빈 결과 `[]` 는 저장 금지** — 피트인/수집실패로 일시적으로 비었을 수 있어,
   *    빈 배열을 캐시하면 영구 결손이 된다(다음 요청 때 재수집되도록 비저장).
   */
  async fetchLocation(params: LocationQueryParams): Promise<OpenF1Location[]> {
    return this.openf1Client.fetchLocationWindow(
      params.session_key,
      params.driver_number!,
      params.dateGt,
      params.dateLt,
    );
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
