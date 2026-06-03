import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { AppModule } from '../src/app.module';
import { CachedOpenF1ClientService } from '../src/common/services/cached-openf1-client.service';
import { PositionsService } from '../src/modules/positions/positions.service';
import { PositionPipelineService } from '../src/modules/positions/position-pipeline.service';
import { OpenF1Location } from '../src/common/interfaces/openf1.interface';
import { PositionsResponse } from '../src/modules/positions/interfaces/positions.interface';

// 연속 주행 픽스처(드라이버 1명, {t,x,y,lng,lat})
const bahrain = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'pipeline-bahrain.json'), 'utf8'),
) as { rows: { t: number; x: number; y: number }[] };

const BASE = Date.parse('2024-03-02T15:00:00Z');
const DRIVER_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);
const DOWNSAMPLE_HZ = 4;

function locationsFor(driver: number): OpenF1Location[] {
  return bahrain.rows.map((r) => ({
    meeting_key: 1,
    session_key: 9472,
    driver_number: driver,
    date: new Date(BASE + Math.round(r.t * 1000)).toISOString(),
    x: r.x,
    y: r.y,
    z: 0,
  }));
}

// circuit_key 별 세션을 돌려주는 목 (기본 bahrain=63). fetchLocation 호출수도 추적.
function makeMockClient(circuitKey = 63) {
  const fetchLocation = jest.fn(
    (p: { driver_number: number }): Promise<OpenF1Location[]> =>
      Promise.resolve(locationsFor(p.driver_number)),
  );
  return {
    fetchLocation,
    fetchLaps: jest.fn().mockResolvedValue([
      {
        driver_number: 1,
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
    fetchDrivers: jest
      .fn()
      .mockResolvedValue(DRIVER_NUMBERS.map((n) => ({ driver_number: n }))),
  };
}

async function bootApp(
  mock: ReturnType<typeof makeMockClient>,
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CachedOpenF1ClientService)
    .useValue(mock)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

describe('GET /sessions/:sk/positions (e2e)', () => {
  let app: INestApplication;
  let mock: ReturnType<typeof makeMockClient>;

  beforeAll(async () => {
    mock = makeMockClient(63);
    app = await bootApp(mock);
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 + {success,data} 래퍼와 PositionsResponse 스키마', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/api/v1/sessions/9472/positions')
      .expect(200);

    const body = res.body as { success: boolean; data: PositionsResponse };
    expect(body.success).toBe(true);
    const data = body.data;
    expect(data.circuitId).toBe('bahrain');
    expect(data.sessionKey).toBe(9472);

    // 드라이버 수 = 20, 각 드라이버 samples 는 {t,lng,lat}
    expect(Object.keys(data.drivers)).toHaveLength(DRIVER_NUMBERS.length);
    const d1 = data.drivers['1'].samples;
    expect(d1.length).toBeGreaterThan(10);
    for (const s of d1) {
      expect(typeof s.t).toBe('number');
      expect(typeof s.lng).toBe('number');
      expect(typeof s.lat).toBe('number');
    }
  });

  it('각 드라이버 t 는 단조 증가한다', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/api/v1/sessions/9472/positions')
      .expect(200);
    const data = (res.body as { data: PositionsResponse }).data;
    for (const { samples } of Object.values(data.drivers)) {
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].t).toBeGreaterThan(samples[i - 1].t);
      }
    }
  });

  it('다운샘플: 출력 밀도(Hz)가 입력보다 낮다', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/api/v1/sessions/9472/positions')
      .expect(200);
    const out = (res.body as { data: PositionsResponse }).data.drivers['1']
      .samples;

    const span = out[out.length - 1].t - out[0].t;
    const outHz = (out.length - 1) / span;
    const inHz = (bahrain.rows.length - 1) / span;

    expect(out.length).toBeLessThan(bahrain.rows.length); // 다운샘플됨
    expect(outHz).toBeLessThan(inHz); // 밀도 감소
    // 평균 Hz 는 목표(4Hz) 근방 — 코너 보존으로 약간 상회 가능
    expect(outHz).toBeLessThanOrEqual(DOWNSAMPLE_HZ * 1.6);
  });

  it('두 번째 요청은 캐시 히트(추가 OpenF1 호출 없음)', async () => {
    mock.fetchLocation.mockClear();
    await request(app.getHttpServer() as App)
      .get('/api/v1/sessions/9472/positions')
      .expect(200);
    // 첫 요청에서 이미 캐시됨 → fetchLocation 추가 호출 0
    expect(mock.fetchLocation).not.toHaveBeenCalled();
  });

  it('캘리브레이션 없는 서킷은 404', async () => {
    const mock2 = makeMockClient(99999); // 미등록 circuit_key
    const app2 = await bootApp(mock2);
    await request(app2.getHttpServer() as App)
      .get('/api/v1/sessions/9472/positions')
      .expect(404);
    await app2.close();
  });
});

// ── 성능 측정 (§17.4): 응답 크기 · 빌드 시간 · 캐시 히트 지연 · 다운샘플 비율 ──
describe('positions 성능 측정', () => {
  let app: INestApplication;
  let mock: ReturnType<typeof makeMockClient>;

  beforeAll(async () => {
    mock = makeMockClient(63);
    app = await bootApp(mock);
  });

  afterAll(async () => {
    await app.close();
  });

  it('메트릭 측정 및 출력', async () => {
    const pipeline = app.get(PositionPipelineService);
    const positions = app.get(PositionsService);

    // 콜드 빌드 시간 (캐시 우회, pipeline 직접 — 20 드라이버 × 1177 입력)
    const t0 = performance.now();
    const built = await pipeline.build(9472);
    const buildMs = performance.now() - t0;

    const json = JSON.stringify(built);
    const sizeKb = Buffer.byteLength(json) / 1024;
    const gzipKb = gzipSync(Buffer.from(json)).length / 1024; // 프로덕션 응답은 gzip
    const drivers = Object.keys(built.drivers).length;
    const inputPerDriver = bahrain.rows.length;
    const outPerDriver = built.drivers['1'].samples.length;
    const downsamplePct = (outPerDriver / inputPerDriver) * 100;

    // 캐시 히트 지연: getPositions 두 번 (key=7777, 콜드/캐시)
    mock.fetchLocation.mockClear();
    const c0 = performance.now();
    await positions.getPositions(7777);
    const coldMs = performance.now() - c0;
    const ingestCalls = mock.fetchLocation.mock.calls.length;
    const h0 = performance.now();
    await positions.getPositions(7777);
    const hitMs = performance.now() - h0;

    console.log(
      [
        '',
        '── positions 성능 측정 (20 드라이버 × ' +
          inputPerDriver +
          ' 입력, mock ingest) ──',
        `응답 크기        : ${sizeKb.toFixed(1)} KB 비압축 / ${gzipKb.toFixed(1)} KB gzip (${drivers} 드라이버)`,
        `드라이버당 출력  : ${outPerDriver} / ${inputPerDriver} 샘플 (다운샘플 ${downsamplePct.toFixed(0)}%)`,
        `파이프라인 빌드  : ${buildMs.toFixed(0)} ms (좌표변환+스냅+다운샘플, 네트워크 제외)`,
        `getPositions 콜드: ${coldMs.toFixed(0)} ms (OpenF1 ingest 호출 ${ingestCalls}회)`,
        `getPositions 히트: ${hitMs.toFixed(2)} ms (캐시)`,
        `※ 실 OpenF1 ingest(네트워크) 시간은 라이브 실행에서 별도 측정 필요`,
        '',
      ].join('\n'),
    );

    // 느슨한 회귀 가드
    expect(sizeKb).toBeGreaterThan(0);
    expect(downsamplePct).toBeLessThan(100); // 다운샘플 동작
    expect(hitMs).toBeLessThan(coldMs); // 캐시 히트가 더 빠름
  });
});
