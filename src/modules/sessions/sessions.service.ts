import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import {
  SessionsQueryParams,
  DriversQueryParams,
  StintsQueryParams,
} from '../../common/interfaces/query-params.interface';
import { F1TransformationsUtil } from '../../common/utils/f1-transformations.util';
import {
  OpenF1Lap,
  OpenF1Interval,
  OpenF1Driver,
  OpenF1Stint,
} from '../../common/interfaces/openf1.interface';
import type {
  SectorPerformance,
  TireCompound,
  TireInfo,
  MiniSector,
  DriverDisplayRow,
  DriverDisplayFrame,
  DriverTimingsResponse,
} from './interfaces/driver-display.interface';

// 내부 헬퍼 타입 (private)
interface LapTimingDto {
  driverCode: string;
  teamColor: string;
  currentLapTime: string;
  bestLapTime: string;
  miniSector: MiniSector;
  tireInfo: TireInfo;
}

interface StandingEntry {
  driverCode: string;
  position: number;
  interval: string;
  intervalToAhead: string;
}

const VALID_COMPOUNDS = new Set<string>([
  'SOFT',
  'MEDIUM',
  'HARD',
  'INTERMEDIATE',
  'WET',
]);
const BLANK_SECTOR: MiniSector = {
  sector1: 'none',
  sector2: 'none',
  sector3: 'none',
};
const DEFAULT_TIRE_INFO: TireInfo = {
  compound: 'UNKNOWN',
  lapCount: 0,
  pitStops: 0,
};
const WINDOW_MS = 2000;

@Injectable()
export class SessionsService extends BaseF1Service {
  // Redis 없이도 반복 호출을 방지하는 인메모리 frames 캐시
  private readonly framesCache = new Map<
    number,
    { frames: DriverDisplayFrame[]; cachedAt: number }
  >();
  private readonly FRAMES_CACHE_TTL_MS = 10 * 60 * 1000; // 10분

  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  async getSessions(country?: string, year?: string) {
    return this.executeWithErrorHandling(
      async () => {
        const params: SessionsQueryParams = {};
        if (country) params.country_name = country;
        if (year) params.year = year;

        const sessions = await this.cachedOpenf1Client.fetchSessions(params);

        return sessions.filter((s: { session_type?: string }) => {
          const type = s.session_type?.toLowerCase() ?? '';
          return [...SessionsService.REPLAYABLE_TYPES].some((t) =>
            type.includes(t),
          );
        });
      },
      'fetch sessions',
      { country, year },
    );
  }

  async getSessionDrivers(sessionKey: number) {
    return this.executeWithErrorHandling(
      async () => {
        const params: DriversQueryParams = { session_key: sessionKey };
        const drivers = await this.cachedOpenf1Client.fetchDrivers(params);

        return drivers.map((driver) =>
          F1TransformationsUtil.transformDriverData(driver),
        );
      },
      'fetch session drivers',
      { sessionKey },
    );
  }

  async getDriverTimings(sessionKey: number): Promise<DriverTimingsResponse> {
    return this.executeWithErrorHandling(
      async () => {
        // 인메모리 캐시 확인 (Redis 미연결 상태에서도 중복 계산 방지)
        const cached = this.framesCache.get(sessionKey);
        if (cached && Date.now() - cached.cachedAt < this.FRAMES_CACHE_TTL_MS) {
          return { frames: cached.frames };
        }

        // 세션 타입 확인: 연습주행(Practice)은 리플레이 미지원
        await this.validateReplayableSession(sessionKey);

        // 순차 호출: Promise.all은 4개 동시 요청으로 OpenF1 429 유발
        const laps = await this.cachedOpenf1Client.fetchLaps({
          session_key: sessionKey,
        });
        const intervals = await this.cachedOpenf1Client.fetchIntervals({
          session_key: sessionKey,
        });
        const drivers = await this.cachedOpenf1Client.fetchDrivers({
          session_key: sessionKey,
        });
        const stints = await this.cachedOpenf1Client.fetchStints({
          session_key: sessionKey,
        } as StintsQueryParams);

        if (laps.length === 0) return { frames: [] };

        const frames = this.buildDisplayFrames(
          laps,
          intervals,
          drivers,
          stints,
        );
        this.framesCache.set(sessionKey, { frames, cachedAt: Date.now() });
        return { frames };
      },
      'get driver timings',
      { sessionKey },
    );
  }

  // 표시용 완전 병합 프레임 배열 생성 (핵심 메서드)
  private buildDisplayFrames(
    allLaps: OpenF1Lap[],
    allIntervals: OpenF1Interval[],
    drivers: OpenF1Driver[],
    stints: OpenF1Stint[],
  ): DriverDisplayFrame[] {
    const lap1Rows = allLaps.filter((l) => l.lap_number === 1);
    if (lap1Rows.length === 0 || allIntervals.length === 0) return [];

    const lap1ValidTimes = lap1Rows
      .filter((l) => l.date_start != null)
      .map((l) => new Date(l.date_start).getTime())
      .filter((t) => t > 0 && Number.isFinite(t));
    if (lap1ValidTimes.length === 0) return [];
    const raceStartMs = Math.min(...lap1ValidTimes);
    const maxLap = this.getMaxLapNumber(allLaps);

    // 전 랩 완료 데이터 사전 계산
    const lapTimingsMap = new Map<number, LapTimingDto[]>();
    for (let lap = 1; lap <= maxLap; lap++) {
      lapTimingsMap.set(
        lap,
        this.buildLapTimings(lap, allLaps, allIntervals, drivers, stints),
      );
    }

    // 랩 시작 타임라인: lapNumber → 해당 랩의 최소 date_start (이진탐색용)
    const lapStartTimes: Array<{ lap: number; ms: number }> = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const rows = allLaps.filter((l) => l.lap_number === lap);
      if (rows.length > 0) {
        lapStartTimes.push({
          lap,
          ms: Math.min(...rows.map((l) => new Date(l.date_start).getTime())),
        });
      }
    }
    lapStartTimes.sort((a, b) => a.ms - b.ms);

    // 레이스 종료 시각: 리더가 maxLap를 완주한 시점
    const raceEndMs = this.computeRaceEndMs(
      lapTimingsMap.get(maxLap) ?? [],
      maxLap,
      allLaps,
      drivers,
    );

    // intervals 시간순 정렬, 2초 윈도우 그룹핑
    const sortedIntervals = [...allIntervals].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const frames: DriverDisplayFrame[] = [];
    const currentState = new Map<number, OpenF1Interval>();
    let lastSnapshotMs = -Infinity;

    for (const interval of sortedIntervals) {
      const intervalMs = new Date(interval.date).getTime();
      currentState.set(interval.driver_number, interval);

      // 레이스 시작 전 interval은 상태만 업데이트하고 프레임 생성 제외
      if (intervalMs < raceStartMs) continue;

      if (intervalMs - lastSnapshotMs < WINDOW_MS) continue;
      lastSnapshotMs = intervalMs;

      const timeOffset = (intervalMs - raceStartMs) / 1000;

      // 현재 랩 결정: lapStartTimes 이진탐색
      let currentLap = 1;
      for (const entry of lapStartTimes) {
        if (entry.ms <= intervalMs) currentLap = entry.lap;
        else break;
      }

      // displayDataLap 결정 (모든 케이스 백엔드에서 처리)
      let displayDataLap: number;
      if (intervalMs >= raceEndMs) {
        displayDataLap = maxLap; // 레이스 완주 후 → 최종 랩 데이터
      } else if (currentLap <= 1) {
        displayDataLap = 0; // 랩 1 → 빈 데이터
      } else {
        displayDataLap = currentLap - 1; // 이전 완료 랩 데이터
      }

      const standings = this.buildStandings(
        Array.from(currentState.values()),
        drivers,
      );
      if (standings.length === 0) continue;

      const lapData =
        displayDataLap > 0 ? (lapTimingsMap.get(displayDataLap) ?? []) : [];
      const lapMap = new Map(lapData.map((t) => [t.driverCode, t]));

      const currentLapData = lapTimingsMap.get(currentLap) ?? [];
      const currentLapMap = new Map(
        currentLapData.map((t) => [t.driverCode, t]),
      );

      const rawRows: DriverDisplayRow[] = standings.map((standing) => {
        const lap = lapMap.get(standing.driverCode);
        const cur = currentLapMap.get(standing.driverCode);
        return {
          position: standing.position,
          driverCode: standing.driverCode,
          teamColor: cur?.teamColor ?? lap?.teamColor ?? '#ffffff',
          interval: standing.interval,
          intervalToAhead: standing.intervalToAhead,
          currentLapTime: lap?.currentLapTime ?? '--:--:---',
          bestLapTime: lap?.bestLapTime ?? '--:--:---',
          miniSector: lap?.miniSector ?? BLANK_SECTOR,
          tireInfo: cur?.tireInfo ?? DEFAULT_TIRE_INFO,
        };
      });

      // DNF 드라이버를 맨 뒤로 재정렬하고 position/interval 재할당
      const activeRows = rawRows.filter((r) => r.currentLapTime !== 'DNF');
      const dnfRows = rawRows.filter((r) => r.currentLapTime === 'DNF');
      const driverRows = [...activeRows, ...dnfRows].map((row, i) => ({
        ...row,
        position: i + 1,
        ...(row.currentLapTime === 'DNF'
          ? { interval: 'DNF', intervalToAhead: '' }
          : {}),
      }));

      frames.push({ timeOffset, currentLap, drivers: driverRows });
    }

    return frames;
  }

  private computeRaceEndMs(
    finalLapTimings: LapTimingDto[],
    maxLap: number,
    allLaps: OpenF1Lap[],
    drivers: OpenF1Driver[],
  ): number {
    const leaderCode = finalLapTimings.find(
      (t) => t.currentLapTime !== 'DNF',
    )?.driverCode;
    if (!leaderCode) return Infinity;

    const leaderDriver = drivers.find((d) => d.name_acronym === leaderCode);
    if (!leaderDriver) return Infinity;

    const leaderMaxLapRow = allLaps.find(
      (l) =>
        l.driver_number === leaderDriver.driver_number &&
        l.lap_number === maxLap,
    );
    if (!leaderMaxLapRow?.lap_duration) return Infinity;

    return (
      new Date(leaderMaxLapRow.date_start).getTime() +
      leaderMaxLapRow.lap_duration * 1000
    );
  }

  private static readonly REPLAYABLE_TYPES = new Set([
    'race',
    'sprint',
    'qualifying',
    'shootout',
  ]);

  private async validateReplayableSession(sessionKey: number): Promise<void> {
    const sessions = await this.cachedOpenf1Client.fetchSessions({
      session_key: sessionKey,
    });
    const session = sessions[0];
    if (!session) {
      throw new HttpException(
        `Session ${sessionKey} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const sessionType = session.session_type?.toLowerCase() ?? '';
    const isReplayable = [...SessionsService.REPLAYABLE_TYPES].some((t) =>
      sessionType.includes(t),
    );
    if (!isReplayable) {
      throw new HttpException(
        `Session type "${session.session_type}" does not support replay. Only Race, Sprint, and Qualifying sessions are supported.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private getMaxLapNumber(laps: OpenF1Lap[]): number {
    return Math.max(
      ...laps.map((l) => l.lap_number).filter((n) => Number.isFinite(n)),
    );
  }

  // 랩 완료 데이터: lapTime, miniSector, tireInfo (내부 헬퍼)
  private buildLapTimings(
    lapNum: number,
    allLaps: OpenF1Lap[],
    allIntervals: OpenF1Interval[],
    drivers: OpenF1Driver[],
    stints: OpenF1Stint[],
  ): LapTimingDto[] {
    // 랩 완료 시점 컷오프 계산
    const nextLapRows = allLaps.filter((l) => l.lap_number === lapNum + 1);
    const currentLapRows = allLaps.filter((l) => l.lap_number === lapNum);

    let cutoffMs: number;
    if (nextLapRows.length > 0) {
      cutoffMs = Math.min(
        ...nextLapRows.map((l) => new Date(l.date_start).getTime()),
      );
    } else if (currentLapRows.length > 0) {
      cutoffMs =
        Math.max(
          ...currentLapRows.map((l) => new Date(l.date_start).getTime()),
        ) + 300_000;
    } else {
      cutoffMs = Infinity;
    }

    // 순서 결정용 인터벌 (이 랩 기준 리더 파악)
    const latestIntervalByDriver = new Map<number, OpenF1Interval>();
    for (const interval of allIntervals) {
      if (new Date(interval.date).getTime() <= cutoffMs) {
        const existing = latestIntervalByDriver.get(interval.driver_number);
        if (!existing || new Date(interval.date) > new Date(existing.date)) {
          latestIntervalByDriver.set(interval.driver_number, interval);
        }
      }
    }

    const sortedIntervals = Array.from(latestIntervalByDriver.values()).sort(
      (a, b) => {
        const ga = toNumericGap(a.gap_to_leader);
        const gb = toNumericGap(b.gap_to_leader);
        if (ga === null || isNaN(ga)) return -1;
        if (gb === null || isNaN(gb)) return 1;
        return ga - gb;
      },
    );

    const timings: LapTimingDto[] = [];

    for (const interval of sortedIntervals) {
      const driver = drivers.find(
        (d) => d.driver_number === interval.driver_number,
      );
      if (!driver) continue;

      const driverLaps = allLaps.filter(
        (l) => l.driver_number === interval.driver_number,
      );
      const lapAtN = driverLaps.find((l) => l.lap_number === lapNum);
      const bestLap = driverLaps
        .filter((l) => l.lap_number <= lapNum && l.lap_duration !== null)
        .reduce<OpenF1Lap | null>(
          (best, lap) =>
            !best || lap.lap_duration! < best.lap_duration! ? lap : best,
          null,
        );

      // 이후 랩에 유효한 데이터가 있으면 DNF가 아님 (레드플래그 등으로 인한 일시적 null)
      const hasLaterValidLaps = driverLaps.some(
        (l) => l.lap_number > lapNum && l.lap_duration !== null,
      );
      const driverMaxLap =
        driverLaps.length > 0
          ? Math.max(...driverLaps.map((l) => l.lap_number))
          : 0;

      const isRetired =
        !hasLaterValidLaps &&
        // Case 1: 해당 랩 데이터가 있지만 lap_duration이 null (명시적 DNF)
        ((lapAtN != null &&
          lapAtN.lap_duration === null &&
          !lapAtN.is_pit_out_lap &&
          lapNum > 1) ||
          // Case 2: 해당 랩 데이터 자체가 없고, 이전 랩이 마지막 (완전 리타이어)
          (!lapAtN && driverLaps.length > 0 && driverMaxLap < lapNum));

      const activeStint = stints.find(
        (s) =>
          s.driver_number === interval.driver_number &&
          s.lap_start <= lapNum &&
          s.lap_end >= lapNum,
      );
      const pitStops = stints.filter(
        (s) => s.driver_number === interval.driver_number && s.lap_end < lapNum,
      ).length;

      timings.push({
        driverCode: driver.name_acronym,
        teamColor: `#${driver.team_colour}`,
        currentLapTime: isRetired
          ? 'DNF'
          : lapAtN?.lap_duration
            ? this.formatLapTime(lapAtN.lap_duration)
            : '--:--:---',
        bestLapTime: bestLap?.lap_duration
          ? this.formatLapTime(bestLap.lap_duration)
          : '--:--:---',
        miniSector: {
          sector1: isRetired
            ? 'none'
            : this.getSectorPerformance(lapAtN?.segments_sector_1),
          sector2: isRetired
            ? 'none'
            : this.getSectorPerformance(lapAtN?.segments_sector_2),
          sector3: isRetired
            ? 'none'
            : this.getSectorPerformance(lapAtN?.segments_sector_3),
        },
        tireInfo: {
          compound: normalizeCompound(activeStint?.compound),
          lapCount: activeStint
            ? lapNum - activeStint.lap_start + 1 + activeStint.tyre_age_at_start
            : 0,
          pitStops,
        },
      });
    }

    // DNF 드라이버를 뒤로 정렬
    const nonDnf = timings.filter((t) => t.currentLapTime !== 'DNF');
    const dnf = timings.filter((t) =>
      t.currentLapTime !== 'DNF' ? false : true,
    );
    return [...nonDnf, ...dnf];
  }

  private buildStandings(
    intervals: OpenF1Interval[],
    drivers: OpenF1Driver[],
  ): StandingEntry[] {
    const sorted = [...intervals].sort((a, b) => {
      const ga = toNumericGap(a.gap_to_leader);
      const gb = toNumericGap(b.gap_to_leader);
      // null gap → 맨 뒤로 (DNF/데이터 없음). 리더는 gap_to_leader=0
      if (ga === null && gb === null) return 0;
      if (ga === null) return 1;
      if (gb === null) return -1;
      return ga - gb;
    });

    const standings: StandingEntry[] = [];
    for (const [index, interval] of sorted.entries()) {
      const driver = drivers.find(
        (d) => d.driver_number === interval.driver_number,
      );
      if (!driver) continue;

      const isLeader = index === 0;
      const gap = toNumericGap(interval.gap_to_leader);
      const intv = toNumericGap(interval.interval);

      standings.push({
        driverCode: driver.name_acronym,
        position: index + 1,
        interval: isLeader ? '--' : gap !== null ? `+${gap.toFixed(3)}` : '--',
        intervalToAhead: isLeader
          ? ''
          : intv !== null
            ? `+${intv.toFixed(3)}`
            : '--',
      });
    }

    return standings;
  }

  private getSectorPerformance(segments?: number[] | null): SectorPerformance {
    if (!segments?.length) return 'none';
    if (segments.some((s) => s === 2051)) return 'fastest';
    if (segments.some((s) => s === 2049)) return 'personal_best';
    if (segments.some((s) => s === 2048)) return 'normal';
    return 'none';
  }

  private formatLapTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${minutes}:${secs.padStart(6, '0')}`;
  }

  async startReplay(sessionKey: number) {
    return this.executeWithErrorHandling(
      async () => {
        // Validate session exists and get drivers
        const drivers = await this.getSessionDrivers(sessionKey);

        // Use base class validation method
        if (drivers.length === 0) {
          await this.validateSession(sessionKey, 'replay data');
        }

        // Pre-load all replay data into cache
        const replayData =
          await this.cachedOpenf1Client.preloadReplayData(sessionKey);

        return this.createResponse(sessionKey, {
          cachingStatus: 'completed',
          availableData: [
            'drivers',
            'laps',
            'intervals',
            'car_data',
            'race_control',
            'stints',
          ],
          driverCount: drivers.length,
          dataStats: {
            lapsCount: replayData.laps.length,
            intervalsCount: replayData.intervals.length,
            stintsCount: replayData.stints.length,
          },
          drivers: drivers,
        });
      },
      'start replay session',
      { sessionKey },
    );
  }
}

function toNumericGap(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function normalizeCompound(compound?: string): TireCompound {
  const upper = compound?.toUpperCase();
  return upper && VALID_COMPOUNDS.has(upper)
    ? (upper as TireCompound)
    : 'UNKNOWN';
}
