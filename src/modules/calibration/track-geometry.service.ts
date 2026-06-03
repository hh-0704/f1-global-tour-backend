import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TrackGeometry } from './interfaces/calibration.interface';

/**
 * 트랙 기하(feat0 LineString) 로드 + 호길이/투영 유틸.
 *
 * 프론트 RoadSnapService 내부 유틸(loadTrack/project/projectForward/posAtArc)을 분리 이관한 것.
 * - geojson 은 **로컬 파일**(data/geojson/{circuitId}.geojson)에서 읽는다 (프론트는 fetch).
 * - feat0 = features[0] = 최다 점 LineString(24트랙 전부 일치 확인). 미터 좌표(kx=cos(lat))로 변환.
 */
@Injectable()
export class TrackGeometryService {
  private readonly logger = new Logger(TrackGeometryService.name);
  private readonly cache = new Map<string, TrackGeometry | null>();

  /** circuitId 의 feat0 기하 로드(+캐시). 없으면 null. */
  load(circuitId: string): TrackGeometry | null {
    if (this.cache.has(circuitId)) return this.cache.get(circuitId) ?? null;

    const track = this.loadTrack(circuitId);
    if (!track || track.length < 2) {
      this.cache.set(circuitId, null);
      return null;
    }

    const meanLat = track.reduce((s, p) => s + p[1], 0) / track.length;
    const kx = Math.cos((meanLat * Math.PI) / 180);
    const tm: [number, number][] = track.map(([lng, lat]) => [
      lng * kx * 111320,
      lat * 111320,
    ]);
    const cum: number[] = [0];
    for (let i = 1; i < tm.length; i++) {
      const dx = tm[i][0] - tm[i - 1][0];
      const dy = tm[i][1] - tm[i - 1][1];
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    const geo: TrackGeometry = { tm, cum, total: cum[cum.length - 1], kx };
    this.cache.set(circuitId, geo);
    return geo;
  }

  /** 점(lng,lat)을 feat0에 투영한 호 길이(전역 최근접). */
  project(geo: TrackGeometry, lng: number, lat: number): number {
    return this.projectImpl(geo, lng, lat, null, 0, 0);
  }

  /**
   * 전진 제약(prevArc 기준 [-backM, +fwdM] 안)에서 최근접 호 길이.
   * 제약 안에 후보가 없으면 prevArc 유지.
   */
  projectForward(
    geo: TrackGeometry,
    lng: number,
    lat: number,
    prevArc: number,
    backM: number,
    fwdM: number,
  ): number {
    const arc = this.projectImpl(geo, lng, lat, prevArc, backM, fwdM);
    return arc < 0 ? prevArc : arc;
  }

  /** 호 길이 arc 위치의 feat0 좌표(원본 lng,lat). 미터→다시 lng,lat 변환. */
  posAtArc(geo: TrackGeometry, arc: number): [number, number] {
    const { tm, cum, kx } = geo;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < arc) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, hi);
    const segLen = cum[i] - cum[i - 1];
    const r = segLen > 0 ? (arc - cum[i - 1]) / segLen : 0;
    const mx = tm[i - 1][0] + (tm[i][0] - tm[i - 1][0]) * r;
    const my = tm[i - 1][1] + (tm[i][1] - tm[i - 1][1]) * r;
    return [mx / (kx * 111320), my / 111320];
  }

  private projectImpl(
    geo: TrackGeometry,
    lng: number,
    lat: number,
    prevArc: number | null,
    backM: number,
    fwdM: number,
  ): number {
    const { tm, cum, total, kx } = geo;
    const px = lng * kx * 111320;
    const py = lat * 111320;
    let bestArc = -1;
    let bestD = Infinity;
    for (let i = 0; i < tm.length - 1; i++) {
      const ax = tm[i][0];
      const ay = tm[i][1];
      const bx = tm[i + 1][0];
      const by = tm[i + 1][1];
      const abx = bx - ax;
      const aby = by - ay;
      const ab2 = abx * abx + aby * aby || 1e-9;
      let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      const arc = cum[i] + (cum[i + 1] - cum[i]) * t;
      if (prevArc !== null) {
        let fd = (((arc - prevArc) % total) + total) % total; // 전진 거리(0..total)
        if (fd > total / 2) fd -= total; // [-total/2, total/2]
        if (fd < -backM || fd > fwdM) continue;
      }
      if (d < bestD) {
        bestD = d;
        bestArc = arc;
      }
    }
    return bestArc;
  }

  private loadTrack(circuitId: string): [number, number][] | null {
    try {
      const path = join(__dirname, 'data', 'geojson', `${circuitId}.geojson`);
      const gj = JSON.parse(readFileSync(path, 'utf8')) as {
        features?: { geometry?: { coordinates?: unknown } }[];
      };
      const coords = gj?.features?.[0]?.geometry?.coordinates;
      return Array.isArray(coords) ? (coords as [number, number][]) : null;
    } catch (err) {
      this.logger.warn(
        `feat0 geojson 로드 실패: ${circuitId} (${String(err)})`,
      );
      return null;
    }
  }
}
