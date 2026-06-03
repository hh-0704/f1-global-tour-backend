import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { OpenF1Session } from '../../common/interfaces/openf1.interface';
import { RaceTimeService } from '../race-time/race-time.service';
import { CoordinateService } from '../calibration/coordinate.service';
import { RoadSnapService } from '../calibration/road-snap.service';
import { resolveCircuitId } from '../calibration/circuit-mapping';
import { LocationSample } from '../calibration/interfaces/calibration.interface';
import {
  PositionSample,
  PositionsResponse,
} from './interfaces/positions.interface';

/**
 * ★ positions 파이프라인 (plan.md §7.2) — 세션당 1회 결정론적 처리.
 *
 * OpenF1 /location 원시 (x,y) → 정제 → 좌표 변환(affine/quad/TPS) → 도로스냅 → 다운샘플 →
 * 드라이버별 `{t,lng,lat}` 시계열(렌더 직전 좌표). 프론트는 이 좌표를 시간 보간만 한다.
 *
 * 동시성: roadSnap.prepare()~snapSample 루프 사이에 await 가 없어(둘 다 동기) 단일 스레드에서
 * 원자적으로 실행 → 공유 싱글톤 roadSnap 상태가 다른 build 와 섞이지 않는다.
 */
@Injectable()
export class PositionPipelineService {
  private readonly logger = new Logger(PositionPipelineService.name);
  private readonly downsampleHz: number;

  // OpenF1 location 단위 ≈ 0.1m → 2000 units/s ≈ 720km/h (명백한 글리치 상한)
  private static readonly MAX_UNITS_PER_SEC = 2000;
  // 피트/차고/결측: 원점 근처(|x|,|y|<50) 제거
  private static readonly PIT_ORIGIN_UNITS = 50;
  // 코너 보존 임계(도): 이 이상 꺾이는 점은 다운샘플에서 항상 유지
  private static readonly TURN_KEEP_DEG = 8;

  constructor(
    private readonly openf1: CachedOpenF1ClientService,
    private readonly raceTime: RaceTimeService,
    private readonly coord: CoordinateService,
    private readonly roadSnap: RoadSnapService,
    configService: ConfigService,
  ) {
    this.downsampleHz =
      configService.get<number>('positions.downsampleHz') ?? 4;
  }

  async build(sessionKey: number): Promise<PositionsResponse> {
    // 1) 세션·트랙 해석
    const sessions = await this.openf1.fetchSessions({
      session_key: sessionKey,
    });
    const session = sessions[0];
    const circuitId = resolveCircuitId(session ?? null);
    if (!circuitId || !this.coord.hasCalibration(circuitId)) {
      throw new NotFoundException(
        `No calibration for session ${sessionKey} (circuit=${circuitId ?? 'unknown'})`,
      );
    }

    // 2) 레이스 시작 기준 + 드라이버 + 레이스 윈도우
    const raceStartMs = await this.raceTime.getRaceStartMs(sessionKey);
    if (!raceStartMs) {
      throw new NotFoundException(
        `No race start time for session ${sessionKey}`,
      );
    }
    const drivers = await this.openf1.fetchDrivers({ session_key: sessionKey });
    const window = this.raceWindow(session, raceStartMs);

    // 3~4) 드라이버별 raw location 수집(순차) + t 부여 + 정제 → {t,x,y}
    const locByDriver = new Map<number, LocationSample[]>();
    for (const d of drivers) {
      const raw = await this.openf1.fetchLocation({
        session_key: sessionKey,
        driver_number: d.driver_number,
        dateGt: window.gt,
        dateLt: window.lt,
      });
      const cleaned = raw
        .map((r) => ({
          t: this.raceTime.toRelativeSeconds(raceStartMs, r.date),
          x: r.x,
          y: r.y,
        }))
        .filter((s) => s.t >= 0)
        .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y))
        .filter(
          (s) =>
            !(
              Math.abs(s.x) < PositionPipelineService.PIT_ORIGIN_UNITS &&
              Math.abs(s.y) < PositionPipelineService.PIT_ORIGIN_UNITS
            ),
        );
      cleaned.sort((a, b) => a.t - b.t);
      const deglitched = this.removeSpeedOutliers(cleaned);
      if (deglitched.length > 0) locByDriver.set(d.driver_number, deglitched);
    }

    // 5) 도로스냅 사전준비 (이 트랙에 스냅존 없으면 no-op)
    this.roadSnap.prepare(circuitId, locByDriver);

    // 6) 변환 + 스냅 → {t,lng,lat}, 다운샘플 (★ 5~6 사이 await 없음 = 원자적)
    const out: PositionsResponse = { sessionKey, circuitId, drivers: {} };
    for (const [num, samples] of locByDriver) {
      const transformed: PositionSample[] = [];
      for (const s of samples) {
        const ll = this.coord.toLngLat(circuitId, s.x, s.y);
        if (!ll) continue;
        const snapped = this.roadSnap.snapSample(num, s.t, ll);
        transformed.push({ t: s.t, lng: snapped[0], lat: snapped[1] });
      }
      out.drivers[String(num)] = { samples: this.downsample(transformed) };
    }

    const driverCount = Object.keys(out.drivers).length;
    this.logger.debug(
      `positions(session=${sessionKey}, circuit=${circuitId}) drivers=${driverCount}`,
    );
    return out;
  }

  // 레이스 구간 date 윈도우. 시작=raceStartMs(t>=0 경계), 종료=session.date_end(없으면 +3h 상한).
  private raceWindow(
    session: OpenF1Session | undefined,
    raceStartMs: number,
  ): { gt: string; lt: string } {
    const gt = new Date(raceStartMs).toISOString();
    let endMs = session?.date_end ? new Date(session.date_end).getTime() : NaN;
    if (!Number.isFinite(endMs) || endMs <= raceStartMs) {
      endMs = raceStartMs + 3 * 60 * 60 * 1000; // 안전 상한 3시간
    }
    return { gt, lt: new Date(endMs).toISOString() };
  }

  // 비현실 점프(글리치) 제거. 시간 정렬된 입력 가정. 중복/역행 t 도 제거.
  private removeSpeedOutliers(sorted: LocationSample[]): LocationSample[] {
    if (sorted.length <= 2) return sorted;
    const out: LocationSample[] = [sorted[0]];
    let last = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      const dt = s.t - last.t;
      if (dt <= 0) continue; // 중복/역행 t
      const dist = Math.hypot(s.x - last.x, s.y - last.y);
      if (dist / dt > PositionPipelineService.MAX_UNITS_PER_SEC) continue;
      out.push(s);
      last = s;
    }
    return out;
  }

  // 코너 적응형 다운샘플: 직선은 ~downsampleHz 로 솎고, 꺾이는 점(코너)은 항상 유지.
  private downsample(samples: PositionSample[]): PositionSample[] {
    if (this.downsampleHz <= 0 || samples.length <= 2) return samples;
    const minDt = 1 / this.downsampleHz;
    const out: PositionSample[] = [samples[0]];
    let lastT = samples[0].t;
    for (let i = 1; i < samples.length - 1; i++) {
      const cur = samples[i];
      const turn = this.turnAngleDeg(samples[i - 1], cur, samples[i + 1]);
      if (
        cur.t - lastT >= minDt ||
        turn >= PositionPipelineService.TURN_KEEP_DEG
      ) {
        out.push(cur);
        lastT = cur.t;
      }
    }
    out.push(samples[samples.length - 1]);
    return out;
  }

  // b 점에서의 방향 전환각(도). lng 는 cos(lat) 스케일로 실제 각도 근사.
  private turnAngleDeg(
    a: PositionSample,
    b: PositionSample,
    c: PositionSample,
  ): number {
    const kx = Math.cos((b.lat * Math.PI) / 180);
    const v1x = (b.lng - a.lng) * kx;
    const v1y = b.lat - a.lat;
    const v2x = (c.lng - b.lng) * kx;
    const v2y = c.lat - b.lat;
    const m1 = Math.hypot(v1x, v1y);
    const m2 = Math.hypot(v2x, v2y);
    if (m1 === 0 || m2 === 0) return 0;
    let cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
    cos = Math.max(-1, Math.min(1, cos));
    return (Math.acos(cos) * 180) / Math.PI;
  }
}
