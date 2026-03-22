import { Injectable } from '@nestjs/common';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { F1TransformationsUtil } from '../../common/utils/f1-transformations.util';

export interface TelemetryFrame {
  timeOffset: number;
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
  drsEnabled: boolean;
  drsAvailable: boolean;
}

export interface DriverTelemetryResponse {
  driverNumber: number;
  driverCode: string;
  teamColor: string;
  frames: TelemetryFrame[];
}

interface CacheEntry {
  data: DriverTelemetryResponse;
  cachedAt: number;
}

@Injectable()
export class TelemetryService extends BaseF1Service {
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10분
  private readonly FRAME_INTERVAL_SEC = 0.5; // 0.5초 간격 다운샘플링

  // 드라이버별 텔레메트리 캐시: `${sessionKey}_${driverNumber}` → CacheEntry
  private readonly telemetryCache = new Map<string, CacheEntry>();

  // 세션별 레이스 시작 시간 캐시
  private readonly raceStartCache = new Map<number, number>();

  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  async getDriverTelemetry(
    sessionKey: number,
    driverNumber: number,
  ): Promise<DriverTelemetryResponse> {
    return this.executeWithErrorHandling(
      async () => {
        // 캐시 확인
        const cacheKey = `${sessionKey}_${driverNumber}`;
        const cached = this.telemetryCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
          this.logger.debug(`Cache hit for telemetry: ${cacheKey}`);
          return cached.data;
        }

        // 레이스 시작 시간 조회 (세션별 캐시)
        const raceStartMs = await this.getRaceStartTime(sessionKey);

        // 드라이버 정보 조회
        const drivers = await this.cachedOpenf1Client.fetchDrivers({
          session_key: sessionKey,
          driver_number: driverNumber,
        });
        const driver = drivers[0];
        if (!driver) {
          throw new Error(`Driver ${driverNumber} not found in session ${sessionKey}`);
        }

        // car_data 조회 (대량 데이터)
        this.logger.debug(`Fetching car_data for driver ${driverNumber} in session ${sessionKey}...`);
        const carData = await this.cachedOpenf1Client.fetchCarData({
          session_key: sessionKey,
          driver_number: driverNumber,
        });
        this.logger.debug(`Received ${carData.length} car_data points`);

        // 다운샘플링
        const frames = this.downsampleCarData(carData, raceStartMs);

        const response: DriverTelemetryResponse = {
          driverNumber: driver.driver_number,
          driverCode: driver.name_acronym,
          teamColor: driver.team_colour,
          frames,
        };

        // 캐시 저장
        this.telemetryCache.set(cacheKey, {
          data: response,
          cachedAt: Date.now(),
        });

        return response;
      },
      `get driver telemetry for driver ${driverNumber} in session ${sessionKey}`,
      { sessionKey, driverNumber },
    );
  }

  private async getRaceStartTime(sessionKey: number): Promise<number> {
    const cached = this.raceStartCache.get(sessionKey);
    if (cached) return cached;

    const laps = await this.cachedOpenf1Client.fetchLaps({
      session_key: sessionKey,
      lap_number: 1,
    });

    const validTimes = laps
      .filter((l) => l.date_start != null)
      .map((l) => new Date(l.date_start).getTime())
      .filter((t) => t > 0 && Number.isFinite(t));

    if (validTimes.length === 0) {
      throw new Error(`Cannot determine race start time for session ${sessionKey}`);
    }

    // 프론트엔드와 동일한 클러스터링 알고리즘 사용
    // 10초 이내 타임스탬프를 같은 클러스터로 묶고, 가장 많은 드라이버가 포함된 클러스터의 최솟값 반환
    const raceStartMs = this.findClusteredRaceStart(validTimes);
    this.raceStartCache.set(sessionKey, raceStartMs);
    return raceStartMs;
  }

  /**
   * 프론트엔드 ReplayDataService.findMostCommonTimestamp()와 동일한 로직
   * 10초 허용범위 내 가장 많은 드라이버가 밀집된 클러스터의 최솟값 반환
   */
  private findClusteredRaceStart(timestamps: number[]): number {
    if (timestamps.length <= 1) return timestamps[0];

    const CLUSTER_THRESHOLD = 10000; // 10초 (ms)
    const sorted = [...timestamps].sort((a, b) => a - b);

    let bestClusterStart = 0;
    let bestClusterSize = 0;

    let clusterStart = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[clusterStart] > CLUSTER_THRESHOLD) {
        const clusterSize = i - clusterStart;
        if (clusterSize > bestClusterSize) {
          bestClusterSize = clusterSize;
          bestClusterStart = clusterStart;
        }
        clusterStart = i;
      }
    }
    // 마지막 클러스터 확인
    const lastClusterSize = sorted.length - clusterStart;
    if (lastClusterSize > bestClusterSize) {
      bestClusterStart = clusterStart;
    }

    return sorted[bestClusterStart];
  }

  private downsampleCarData(
    carData: { date: string; speed: number; n_gear: number; throttle: number; brake: number; drs: number }[],
    raceStartMs: number,
  ): TelemetryFrame[] {
    if (carData.length === 0) return [];

    // date 기준 정렬 및 timeOffset 계산
    const sorted = carData
      .map((entry) => ({
        timeOffset: (new Date(entry.date).getTime() - raceStartMs) / 1000,
        speed: entry.speed ?? 0,
        gear: entry.n_gear ?? 0,
        throttle: entry.throttle ?? 0,
        brake: entry.brake ?? 0,
        drs: entry.drs,
      }))
      .filter((e) => e.timeOffset >= 0)
      .sort((a, b) => a.timeOffset - b.timeOffset);

    if (sorted.length === 0) return [];

    // 2초 간격으로 다운샘플링 (이진탐색으로 가장 가까운 포인트 선택)
    const maxTimeOffset = sorted[sorted.length - 1].timeOffset;
    const frames: TelemetryFrame[] = [];

    for (let t = 0; t <= maxTimeOffset; t += this.FRAME_INTERVAL_SEC) {
      const idx = this.findClosestIndex(sorted, t);
      const entry = sorted[idx];
      const drsState = F1TransformationsUtil.transformDRS(entry.drs);

      frames.push({
        timeOffset: Math.round(t * 10) / 10, // 소수점 1자리
        speed: entry.speed,
        gear: entry.gear,
        throttle: entry.throttle,
        brake: entry.brake,
        drsEnabled: drsState.enabled,
        drsAvailable: drsState.available,
      });
    }

    return frames;
  }

  /**
   * 이진탐색으로 targetTime에 가장 가까운 인덱스 반환
   */
  private findClosestIndex(
    sorted: { timeOffset: number }[],
    targetTime: number,
  ): number {
    let lo = 0;
    let hi = sorted.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sorted[mid].timeOffset < targetTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo가 targetTime 이상인 첫 인덱스 — 이전 인덱스와 비교하여 더 가까운 쪽 선택
    if (lo > 0) {
      const diffPrev = Math.abs(sorted[lo - 1].timeOffset - targetTime);
      const diffCurr = Math.abs(sorted[lo].timeOffset - targetTime);
      return diffPrev <= diffCurr ? lo - 1 : lo;
    }

    return lo;
  }
}
