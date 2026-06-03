import { Injectable } from '@nestjs/common';
import { CoordinateService } from './coordinate.service';
import { TrackGeometryService } from './track-geometry.service';
import {
  LocationSample,
  SnapZone,
  TrackGeometry,
} from './interfaces/calibration.interface';
import {
  SNAP_BACK_M,
  SNAP_BLEND,
  SNAP_FWD_M,
  SNAP_ZONES,
} from './data/snap-zones';

interface ProgressSample {
  t: number;
  arc: number;
} // arc: 트랙 시작부터 호 길이(m)

/**
 * 진행률(progress) 기반 도로 스냅 — 프론트 RoadSnapService 의 **사전계산판** 포팅.
 *
 * 프론트는 런타임(매 프레임) 스냅이지만, 백엔드는 파이프라인에서 location 샘플마다
 * snapSample() 을 호출해 결과를 미리 {t,lng,lat} 에 반영한다.
 *
 * 평행한 두 도로가 가까이 붙은 구간(monaco S/F 등)에서 마커가 옆 도로로 새는 문제를,
 * location 시계열의 '시간 순서'를 이용한 **전진 제약 투영**으로 드라이버별 진행률을 1회 계산해
 * 해결한다. 진행률은 단조 증가(랩 경계서 wrap)하므로 평행 도로로 절대 안 샌다.
 *
 * ⚠ 상태유지: prepare() → snapSample() 은 한 트랙/세션을 순차 처리하는 동안만 유효.
 *    파이프라인이 build() 안에서 prepare 후 즉시 모든 snapSample 을 끝내는 전제(단일비행).
 */
@Injectable()
export class RoadSnapService {
  private circuitId = '';
  private zones: SnapZone[] = [];
  private geo: TrackGeometry | null = null;
  private progress = new Map<number, ProgressSample[]>();
  private ready = false;

  constructor(
    private readonly coord: CoordinateService,
    private readonly geometry: TrackGeometryService,
  ) {}

  /**
   * location 데이터 주입 시 호출. feat0 로드 + 드라이버별 진행률(전진제약 투영) 사전계산.
   * 스냅 구간이 없는 트랙이면 즉시 no-op(ready=false) → snapSample 이 fallback 그대로 반환.
   */
  prepare(
    circuitId: string,
    locationByDriver: Map<number, LocationSample[]>,
  ): void {
    this.ready = false;
    this.circuitId = circuitId;
    this.zones = SNAP_ZONES[circuitId] ?? [];
    this.progress = new Map();
    this.geo = null;
    if (this.zones.length === 0) return; // 이 트랙은 도로스냅 불필요

    const geo = this.geometry.load(circuitId);
    if (!geo) return;
    this.geo = geo;

    // 드라이버별 진행률: 시간순 전진 제약 투영
    for (const [driverNumber, samples] of locationByDriver) {
      const arr: ProgressSample[] = [];
      let prev = -1;
      for (const s of samples) {
        const coords = this.coord.toLngLat(circuitId, s.x, s.y);
        if (!coords) {
          arr.push({ t: s.t, arc: prev < 0 ? 0 : prev });
          continue;
        }
        const arc =
          prev < 0
            ? this.geometry.project(geo, coords[0], coords[1])
            : this.geometry.projectForward(
                geo,
                coords[0],
                coords[1],
                prev,
                SNAP_BACK_M,
                SNAP_FWD_M,
              );
        arr.push({ t: s.t, arc });
        prev = arc;
      }
      this.progress.set(driverNumber, arr);
    }
    this.ready = true;
  }

  clear(): void {
    this.ready = false;
    this.circuitId = '';
    this.zones = [];
    this.geo = null;
    this.progress = new Map();
  }

  /** 스냅 구간이면 진행률 위치의 도로 점(경계 블렌드), 아니면 fallback 그대로. */
  snapSample(
    driverNumber: number,
    currentTime: number,
    fallback: [number, number],
  ): [number, number] {
    if (!this.ready || !this.geo) return fallback;
    const arr = this.progress.get(driverNumber);
    if (!arr || arr.length < 2) return fallback;

    const arc = this.interpArc(arr, currentTime);
    if (arc < 0) return fallback;
    const blend = this.zoneBlend(arc / this.geo.total);
    if (blend <= 0) return fallback;

    const road = this.geometry.posAtArc(this.geo, arc);
    if (blend >= 1) return road;
    return [
      fallback[0] + (road[0] - fallback[0]) * blend,
      fallback[1] + (road[1] - fallback[1]) * blend,
    ];
  }

  // currentTime 기준 진행률(호 길이) 보간. wrap 처리.
  private interpArc(arr: ProgressSample[], t: number): number {
    const total = this.geo!.total;
    if (t <= arr[0].t) return arr[0].arc;
    if (t >= arr[arr.length - 1].t) return -1; // 데이터 종료 후
    let lo = 0;
    let hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const a0 = arr[hi - 1];
    const a1 = arr[hi];
    const span = a1.t - a0.t;
    const r = span > 0 ? (t - a0.t) / span : 0;
    const p0 = a0.arc;
    let p1 = a1.arc;
    if (p1 - p0 > total / 2)
      p1 -= total; // 역방향 wrap 보정
    else if (p0 - p1 > total / 2) p1 += total; // S/F 횡단
    let p = p0 + (p1 - p0) * r;
    p = ((p % total) + total) % total;
    return p;
  }

  // 진행률 frac(0-1)이 스냅 구간 안이면 1, 경계 BLEND 폭에서 0~1, 밖이면 0
  private zoneBlend(frac: number): number {
    let best = 0;
    for (const z of this.zones) {
      const d = this.insideDepth(frac, z); // 구간 안쪽 깊이(진행률), 밖이면 음수
      if (d <= 0) continue;
      best = Math.max(best, Math.min(1, d / SNAP_BLEND));
    }
    return best;
  }

  // frac이 구간[z.start,z.end](wrap 가능) 안이면 가장 가까운 경계까지 거리, 밖이면 -1
  private insideDepth(frac: number, z: SnapZone): number {
    const inside =
      z.end >= z.start
        ? frac >= z.start && frac <= z.end
        : frac >= z.start || frac <= z.end;
    if (!inside) return -1;
    const distTo = (a: number, b: number) => {
      const d = Math.abs(a - b);
      return Math.min(d, 1 - d);
    };
    return Math.min(distTo(frac, z.start), distTo(frac, z.end));
  }
}
