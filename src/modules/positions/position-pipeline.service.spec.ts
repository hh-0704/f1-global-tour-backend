import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PositionPipelineService } from './position-pipeline.service';
import { PositionsResponse } from './interfaces/positions.interface';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { RaceTimeService } from '../race-time/race-time.service';
import { CoordinateService } from '../calibration/coordinate.service';
import { RoadSnapService } from '../calibration/road-snap.service';
import { TrackGeometryService } from '../calibration/track-geometry.service';
import { OpenF1Location } from '../../common/interfaces/openf1.interface';

const FIX = join(__dirname, '..', '..', '..', 'test', 'fixtures');
const bahrain = JSON.parse(
  readFileSync(join(FIX, 'pipeline-bahrain.json'), 'utf8'),
) as {
  sessionKey: number;
  driver: number;
  rows: { t: number; x: number; y: number; lng: number; lat: number }[];
};
const monaco = JSON.parse(
  readFileSync(join(FIX, 'pipeline-monaco.json'), 'utf8'),
) as {
  sessionKey: number;
  driver: number;
  rows: { t: number; x: number; y: number }[];
};

const BASE = Date.parse('2024-03-02T15:00:00Z');

// 픽스처 {t,x,y} → OpenF1Location (date = BASE + t*1000)
function toLocation(
  rows: { t: number; x: number; y: number }[],
  driver: number,
): OpenF1Location[] {
  return rows.map((r) => ({
    meeting_key: 1,
    session_key: 9472,
    driver_number: driver,
    date: new Date(BASE + Math.round(r.t * 1000)).toISOString(),
    x: r.x,
    y: r.y,
    z: 0,
  }));
}

interface MockClient {
  fetchSessions: jest.Mock;
  fetchDrivers: jest.Mock;
  fetchLocation: jest.Mock;
  fetchLaps: jest.Mock;
}

async function buildModule(client: MockClient): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      PositionPipelineService,
      RaceTimeService,
      CoordinateService,
      TrackGeometryService,
      RoadSnapService,
      { provide: CachedOpenF1ClientService, useValue: client },
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue(4) },
      },
    ],
  }).compile();
}

// 한 드라이버·계산된 circuit_key 세션을 돌려주는 표준 목 클라이언트
function mockClientFor(
  circuitKey: number,
  driver: number,
  locations: OpenF1Location[],
): MockClient {
  return {
    fetchLaps: jest.fn().mockResolvedValue([
      {
        driver_number: driver,
        lap_number: 1,
        date_start: new Date(BASE).toISOString(),
      },
    ]),
    fetchSessions: jest.fn().mockResolvedValue([
      {
        session_key: 9472,
        circuit_key: circuitKey,
        circuit_short_name: 'X',
        date_start: new Date(BASE).toISOString(),
        date_end: new Date(BASE + 2 * 3600 * 1000).toISOString(),
      },
    ]),
    fetchDrivers: jest.fn().mockResolvedValue([{ driver_number: driver }]),
    fetchLocation: jest.fn().mockResolvedValue(locations),
  };
}

function assertMonotonic(samples: { t: number }[]) {
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i].t).toBeGreaterThan(samples[i - 1].t);
  }
}

describe('PositionPipelineService — 게이트 2a/2b', () => {
  // ── 게이트 2a: bahrain 좌표 재현 (PoC 와 동일 주행) ──
  it('bahrain: 출력 좌표가 PoC(프론트 변환)와 정확히 일치한다', async () => {
    const client = mockClientFor(
      63,
      bahrain.driver,
      toLocation(bahrain.rows, bahrain.driver),
    );
    const mod = await buildModule(client);
    const pipeline = mod.get(PositionPipelineService);

    const res: PositionsResponse = await pipeline.build(9472);

    expect(res.circuitId).toBe('bahrain');
    const out = res.drivers[String(bahrain.driver)].samples;
    expect(out.length).toBeGreaterThan(10);

    // t → 기대 (lng,lat) 맵 (스냅 없는 트랙이라 출력 == 프론트 toLngLat)
    const expected = new Map<string, { lng: number; lat: number }>();
    for (const r of bahrain.rows) {
      expected.set(r.t.toFixed(3), { lng: r.lng, lat: r.lat });
    }
    for (const s of out) {
      const exp = expected.get(s.t.toFixed(3));
      expect(exp).toBeDefined();
      expect(Math.abs(s.lng - exp!.lng)).toBeLessThan(1e-9);
      expect(Math.abs(s.lat - exp!.lat)).toBeLessThan(1e-9);
    }

    // 다운샘플: 입력보다 적지만 합리적 비율 유지, t 단조 증가
    expect(out.length).toBeLessThan(bahrain.rows.length);
    assertMonotonic(out);
  });

  // ── 게이트 2b: monaco 도로스냅이 파이프라인에 반영(S/F 평행구간 보정) ──
  it('monaco: 모든 좌표가 유한·단조이며, 스냅이 일부 좌표를 이동시킨다', async () => {
    const client = mockClientFor(
      22,
      monaco.driver,
      toLocation(monaco.rows, monaco.driver),
    );
    const mod = await buildModule(client);
    const pipeline = mod.get(PositionPipelineService);
    const coord = mod.get(CoordinateService);

    const res = await pipeline.build(9472); // sessionKey 는 목이 무시(고정 반환)
    expect(res.circuitId).toBe('monaco');
    const out = res.drivers[String(monaco.driver)].samples;
    expect(out.length).toBeGreaterThan(10);

    assertMonotonic(out);
    for (const s of out) {
      expect(Number.isFinite(s.lng)).toBe(true);
      expect(Number.isFinite(s.lat)).toBe(true);
    }

    // t → (x,y) 로 '스냅 전' 순수 변환과 비교 → S/F 구간에서 차이 발생해야 함
    const xyByT = new Map<string, { x: number; y: number }>();
    for (const r of monaco.rows) xyByT.set(r.t.toFixed(3), { x: r.x, y: r.y });
    let maxDiff = 0;
    for (const s of out) {
      const xy = xyByT.get(s.t.toFixed(3));
      if (!xy) continue;
      const pure = coord.toLngLat('monaco', xy.x, xy.y)!;
      maxDiff = Math.max(
        maxDiff,
        Math.abs(s.lng - pure[0]) + Math.abs(s.lat - pure[1]),
      );
    }
    // 스냅이 S/F 평행구간에서 좌표를 눈에 띄게(>~1m) 이동시킴
    expect(maxDiff).toBeGreaterThan(1e-5);
  });
});

describe('PositionPipelineService — 정제/동작', () => {
  it('캘리브레이션 없는 서킷은 404(NotFound)', async () => {
    const client = mockClientFor(99999, 1, []); // 미등록 circuit_key
    client.fetchSessions.mockResolvedValue([
      { session_key: 9472, circuit_key: 99999, circuit_short_name: '???' },
    ]);
    const mod = await buildModule(client);
    const pipeline = mod.get(PositionPipelineService);

    await expect(pipeline.build(9472)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('피트/결측(|x|<50 && |y|<50)과 pre-start(t<0) 샘플을 제거한다', async () => {
    const driver = 7;
    const locations: OpenF1Location[] = [
      // pre-start (t = -1) → 제거
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE - 1000).toISOString(),
        x: 1928,
        y: 8067,
        z: 0,
      },
      // 피트/원점 근처 → 제거
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 500).toISOString(),
        x: 10,
        y: -20,
        z: 0,
      },
      // 유효 주행점들 (0.3s 간격 → 다운샘플 시간바닥 0.25s 충족, 전부 유지)
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1000).toISOString(),
        x: 1928,
        y: 8067,
        z: 0,
      },
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1300).toISOString(),
        x: 1980,
        y: 8140,
        z: 0,
      },
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1600).toISOString(),
        x: 2040,
        y: 8210,
        z: 0,
      },
    ];
    const client = mockClientFor(63, driver, locations);
    const mod = await buildModule(client);
    const pipeline = mod.get(PositionPipelineService);

    const res = await pipeline.build(9472);
    const out = res.drivers[String(driver)].samples;
    // pre-start·피트 2개 제거 → 유효 3개 (0.3s 간격이라 다운샘플도 전부 유지)
    expect(out.length).toBe(3);
    expect(out.every((s) => s.t >= 0)).toBe(true);
  });

  it('비현실 점프(속도 글리치) 샘플을 제거한다', async () => {
    const driver = 9;
    const locations: OpenF1Location[] = [
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1000).toISOString(),
        x: 1928,
        y: 8067,
        z: 0,
      },
      // 0.1초 만에 100000 units(=10km) 점프 → 글리치 제거
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1100).toISOString(),
        x: 101928,
        y: 108067,
        z: 0,
      },
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1300).toISOString(),
        x: 1970,
        y: 8120,
        z: 0,
      },
      {
        meeting_key: 1,
        session_key: 9472,
        driver_number: driver,
        date: new Date(BASE + 1500).toISOString(),
        x: 2010,
        y: 8170,
        z: 0,
      },
    ];
    const client = mockClientFor(63, driver, locations);
    const mod = await buildModule(client);
    const pipeline = mod.get(PositionPipelineService);

    const res = await pipeline.build(9472);
    const out = res.drivers[String(driver)].samples;
    // 글리치 1개 제거 → 3개
    expect(out.length).toBe(3);
  });
});
