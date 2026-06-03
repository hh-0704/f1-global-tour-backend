import { readFileSync } from 'fs';
import { join } from 'path';
import { CoordinateService } from './coordinate.service';
import { TrackGeometryService } from './track-geometry.service';
import { RoadSnapService } from './road-snap.service';
import { LocationSample } from './interfaces/calibration.interface';

/**
 * 🚧 변환 동일성 게이트 (plan.md §17.1)
 *
 * 프론트 LocationCoordinateService.toLngLat 로 생성한 golden 픽스처
 * (scripts/gen-coordinate-golden.ts → test/fixtures/coordinate-golden.json)를
 * 백엔드 CoordinateService 가 < 1e-9 로 재현하는지 검증한다.
 * 계수 복사 누락·오타가 있으면 즉시 실패한다 (통과 전 positions 파이프라인 진행 금지).
 */
interface GoldenRow {
  circuitId: string;
  x: number;
  y: number;
  lng: number;
  lat: number;
}

const GOLDEN_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'coordinate-golden.json',
);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenRow[];

// plan.md A.6 의 캘리브 대상 24트랙
const CALIBRATED_TRACKS = [
  'bahrain',
  'usa',
  'azerbaijan',
  'spain',
  'hungary',
  'imola',
  'brazil',
  'saudi-arabia',
  'las-vegas',
  'qatar',
  'australia',
  'mexico',
  'miami',
  'monaco',
  'canada',
  'italy',
  'china',
  'britain',
  'singapore',
  'belgium',
  'austria',
  'japan',
  'abu-dhabi',
  'netherlands',
];

const EPS = 1e-9;

describe('CoordinateService — 프론트 변환 동일성 게이트', () => {
  const coord = new CoordinateService();

  it('golden 픽스처가 비어있지 않다', () => {
    expect(golden.length).toBeGreaterThan(1000);
  });

  it('24개 캘리브 트랙 모두 hasCalibration=true', () => {
    for (const t of CALIBRATED_TRACKS) {
      expect(coord.hasCalibration(t)).toBe(true);
    }
  });

  // 트랙별로 그룹화해 최대 오차/최초 불일치 지점을 명확히 보고
  const byTrack = new Map<string, GoldenRow[]>();
  for (const r of golden) {
    if (!byTrack.has(r.circuitId)) byTrack.set(r.circuitId, []);
    byTrack.get(r.circuitId)!.push(r);
  }

  for (const track of CALIBRATED_TRACKS) {
    it(`${track}: toLngLat 가 프론트와 < 1e-9 일치`, () => {
      const rows = byTrack.get(track) ?? [];
      expect(rows.length).toBeGreaterThan(0); // 픽스처에 해당 트랙 표본 존재

      let maxDLng = 0;
      let maxDLat = 0;
      let firstFail: { row: GoldenRow; got: [number, number] | null } | null =
        null;

      for (const row of rows) {
        const got = coord.toLngLat(track, row.x, row.y);
        if (!got) {
          firstFail = { row, got: null };
          break;
        }
        const dLng = Math.abs(got[0] - row.lng);
        const dLat = Math.abs(got[1] - row.lat);
        maxDLng = Math.max(maxDLng, dLng);
        maxDLat = Math.max(maxDLat, dLat);
        if ((dLng > EPS || dLat > EPS) && !firstFail) {
          firstFail = { row, got };
        }
      }

      if (firstFail) {
        throw new Error(
          `${track} 불일치: x=${firstFail.row.x},y=${firstFail.row.y} ` +
            `expected=[${firstFail.row.lng},${firstFail.row.lat}] got=${JSON.stringify(firstFail.got)}`,
        );
      }
      expect(maxDLng).toBeLessThan(EPS);
      expect(maxDLat).toBeLessThan(EPS);
    });
  }
});

describe('TrackGeometry / RoadSnap — 도로스냅 배선 스모크', () => {
  const coord = new CoordinateService();
  const geometry = new TrackGeometryService();

  it('feat0 geojson 을 로컬 파일에서 24트랙 모두 로드한다', () => {
    for (const t of CALIBRATED_TRACKS) {
      const geo = geometry.load(t);
      expect(geo).not.toBeNull();
      expect(geo!.tm.length).toBeGreaterThan(1);
      expect(geo!.total).toBeGreaterThan(0);
      expect(Number.isFinite(geo!.kx)).toBe(true);
    }
  });

  it('스냅존 없는 트랙(bahrain)은 snapSample 이 fallback 그대로 반환', () => {
    const snap = new RoadSnapService(coord, geometry);
    const loc = new Map<number, LocationSample[]>([
      [
        1,
        [
          { t: 0, x: 0, y: 0 },
          { t: 1, x: 100, y: 100 },
        ],
      ],
    ]);
    snap.prepare('bahrain', loc);
    const fallback: [number, number] = [50.5, 26.0];
    expect(snap.snapSample(1, 0.5, fallback)).toEqual(fallback);
  });

  it('스냅존 있는 트랙(monaco)은 prepare/snapSample 이 유한 좌표를 반환', () => {
    // monaco golden x,y 를 시간순 합성 시계열로 사용 (배선 검증용 — 정확도는 시각 게이트에서)
    const monaco = golden.filter((r) => r.circuitId === 'monaco');
    const series: LocationSample[] = monaco.map((r, i) => ({
      t: i * 0.5,
      x: r.x,
      y: r.y,
    }));
    expect(series.length).toBeGreaterThan(2);

    const snap = new RoadSnapService(coord, geometry);
    snap.prepare('monaco', new Map([[44, series]]));

    const mid = series[Math.floor(series.length / 2)];
    const fallback = coord.toLngLat('monaco', mid.x, mid.y)!;
    const out = snap.snapSample(44, mid.t, fallback);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
  });
});
