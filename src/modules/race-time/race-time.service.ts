import { Injectable, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OpenF1Lap } from '../../common/interfaces/openf1.interface';

/**
 * ★ 시간축 단일 기준 (plan.md §6)
 *
 * 모든 시계열 t 의 0점 = raceStartMs(레이스 시작 절대 epoch ms). 단일 계산·공유로
 * positions 의 `t`, driver-timings 의 `timeOffset`, laps 의 `lapStartTime` 이 같은 0점을 갖게 한다.
 *
 * raceStartMs 규칙(프론트 ReplayDataService.sortAndProcessLaps/findMostCommonTimestamp 이관):
 *   1) 드라이버별 '최소 lap_number' 랩의 date_start 수집(유효한 것만).
 *   2) 10초 이내를 한 클러스터로 묶어 **가장 큰 클러스터의 최솟값** = raceStartMs.
 *      (레드플래그로 일부 드라이버가 lap1 을 재시작해도 다수결로 실제 출발 시각 확보.)
 *
 * 캐시: 과거 레이스의 raceStartMs 는 불변 → race_start_cache(BigInt) 영구 캐시(plan.md §6.6).
 *       끝난 세션·유효값(>0)만 저장.
 */
@Injectable()
export class RaceTimeService {
  private readonly logger = new Logger(RaceTimeService.name);
  private static readonly CLUSTER_THRESHOLD_MS = 10000; // 10초

  constructor(
    private readonly openf1: CachedOpenF1ClientService,
    private readonly prisma: PrismaService,
  ) {}

  /** 레이스 시작 절대 epoch ms. 유효 랩이 없으면 0. */
  async getRaceStartMs(sessionKey: number): Promise<number> {
    // 1. RDB 조회
    try {
      const row = await this.prisma.raceStartCache.findUnique({
        where: { sessionKey },
      });
      if (row) return Number(row.raceStartMs);
    } catch (e) {
      this.logger.warn(
        `raceStart 캐시 조회 실패(session=${sessionKey}): ${this.errMsg(e)}`,
      );
    }

    const laps = await this.openf1.fetchLaps({ session_key: sessionKey });
    const raceStartMs = this.computeRaceStartMs(laps);

    // 2. 유효값(>0) + 끝난 세션만 영구 저장
    if (raceStartMs > 0 && (await this.openf1.isSessionFinal(sessionKey))) {
      try {
        await this.prisma.raceStartCache.upsert({
          where: { sessionKey },
          create: { sessionKey, raceStartMs: BigInt(raceStartMs) },
          update: { raceStartMs: BigInt(raceStartMs), computedAt: new Date() },
        });
      } catch (e) {
        this.logger.warn(
          `raceStart 캐시 저장 실패(session=${sessionKey}): ${this.errMsg(e)}`,
        );
      }
    }

    this.logger.debug(
      `raceStartMs(session=${sessionKey}) = ${raceStartMs} (${
        raceStartMs ? new Date(raceStartMs).toISOString() : 'n/a'
      })`,
    );
    return raceStartMs;
  }

  private errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  /** dateIso 를 raceStartMs 기준 상대 초로. (pre-start 면 음수) */
  toRelativeSeconds(raceStartMs: number, dateIso: string): number {
    return (new Date(dateIso).getTime() - raceStartMs) / 1000;
  }

  /** 드라이버별 첫 랩 date_start → 클러스터 다수결. (테스트·재사용 위해 분리) */
  computeRaceStartMs(laps: OpenF1Lap[]): number {
    // 드라이버별 그룹화
    const byDriver = new Map<number, OpenF1Lap[]>();
    for (const lap of laps) {
      const arr = byDriver.get(lap.driver_number) ?? [];
      arr.push(lap);
      byDriver.set(lap.driver_number, arr);
    }

    // 각 드라이버: 유효 date_start 중 최소 lap_number 의 시각
    const firstLapTimes: number[] = [];
    for (const [, driverLaps] of byDriver) {
      const valid = driverLaps
        .filter((l) => l.date_start != null)
        .map((l) => ({
          lap: l.lap_number,
          ms: new Date(l.date_start).getTime(),
        }))
        .filter((l) => Number.isFinite(l.ms) && l.ms > 0);
      if (valid.length === 0) continue;
      const minLap = Math.min(...valid.map((l) => l.lap));
      const firstLap = valid.find((l) => l.lap === minLap);
      if (firstLap) firstLapTimes.push(firstLap.ms);
    }

    return this.mostCommonTimestamp(firstLapTimes);
  }

  // 타임스탬프 배열에서 가장 많은 값이 밀집된 클러스터의 최솟값 반환.
  // (10초 이내를 같은 클러스터로 — 프론트 findMostCommonTimestamp 와 동일 로직)
  private mostCommonTimestamp(timestamps: number[]): number {
    if (timestamps.length === 0) return 0;
    if (timestamps.length === 1) return timestamps[0];

    const sorted = [...timestamps].sort((a, b) => a - b);
    const T = RaceTimeService.CLUSTER_THRESHOLD_MS;

    let bestClusterStart = 0;
    let bestClusterSize = 0;
    let clusterStart = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[clusterStart] > T) {
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
}
