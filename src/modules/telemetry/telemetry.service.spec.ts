import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from './telemetry.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import {
  OpenF1CarData,
  OpenF1Driver,
  OpenF1Lap,
} from '../../common/interfaces/openf1.interface';

const SESSION_KEY = 9472;
const DRIVER_NUMBER = 1;
const RACE_START = '2024-04-07T04:07:00.000Z';
const RACE_START_MS = new Date(RACE_START).getTime();

const DRIVER: OpenF1Driver = {
  meeting_key: 1,
  session_key: SESSION_KEY,
  driver_number: DRIVER_NUMBER,
  full_name: 'Max VERSTAPPEN',
  name_acronym: 'VER',
  team_name: 'Red Bull Racing',
  team_colour: '3671C6',
};

const LAP1: OpenF1Lap = {
  meeting_key: 1,
  session_key: SESSION_KEY,
  driver_number: DRIVER_NUMBER,
  lap_number: 1,
  date_start: RACE_START,
  lap_duration: 90,
  is_pit_out_lap: false,
  duration_sector_1: 28,
  duration_sector_2: 32,
  duration_sector_3: 30,
};

const makeCarData = (
  offsetSec: number,
  speed: number,
  drs = 0,
): OpenF1CarData => ({
  meeting_key: 1,
  session_key: SESSION_KEY,
  driver_number: DRIVER_NUMBER,
  date: new Date(RACE_START_MS + offsetSec * 1000).toISOString(),
  speed,
  n_gear: 7,
  throttle: 100,
  brake: 0,
  drs,
});

describe('TelemetryService', () => {
  let service: TelemetryService;
  let mockClient: jest.Mocked<CachedOpenF1ClientService>;

  beforeEach(async () => {
    mockClient = {
      fetchSessions: jest.fn(),
      fetchDrivers: jest.fn(),
      fetchLaps: jest.fn(),
      fetchIntervals: jest.fn(),
      fetchStints: jest.fn(),
      fetchCarData: jest.fn(),
      fetchRaceControl: jest.fn(),
      preloadReplayData: jest.fn(),
    } as unknown as jest.Mocked<CachedOpenF1ClientService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        { provide: CachedOpenF1ClientService, useValue: mockClient },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
  });

  function setupDefaultMocks(carData: OpenF1CarData[] = []) {
    mockClient.fetchLaps.mockResolvedValue([LAP1]);
    mockClient.fetchDrivers.mockResolvedValue([DRIVER]);
    mockClient.fetchCarData.mockResolvedValue(carData);
  }

  // ── 기본 응답 구조 ────────────────────────────────────────────────────────────

  it('getDriverTelemetry: driverNumber, driverCode, teamColor, frames를 포함한 응답을 반환한다', async () => {
    setupDefaultMocks([makeCarData(1, 200), makeCarData(2, 250)]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    expect(result.driverNumber).toBe(DRIVER_NUMBER);
    expect(result.driverCode).toBe('VER');
    expect(result.teamColor).toBe('#3671C6');
    expect(Array.isArray(result.frames)).toBe(true);
    expect(result.frames.length).toBeGreaterThan(0);
  });

  // ── 프레임 필드 ───────────────────────────────────────────────────────────────

  it('getDriverTelemetry: 각 프레임이 timeOffset, speed, gear, throttle, brake, drs 필드를 갖는다', async () => {
    setupDefaultMocks([makeCarData(1, 300, 10)]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);
    const frame = result.frames[0];

    expect(frame).toHaveProperty('timeOffset');
    expect(frame).toHaveProperty('speed');
    expect(frame).toHaveProperty('gear');
    expect(frame).toHaveProperty('throttle');
    expect(frame).toHaveProperty('brake');
    expect(frame).toHaveProperty('drsEnabled');
    expect(frame).toHaveProperty('drsAvailable');
  });

  // ── DRS 변환 ──────────────────────────────────────────────────────────────────

  it('getDriverTelemetry: DRS=10 → drsEnabled=true, drsAvailable=true', async () => {
    setupDefaultMocks([makeCarData(1, 300, 10)]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);
    const frame = result.frames[0];

    expect(frame.drsEnabled).toBe(true);
    expect(frame.drsAvailable).toBe(true);
  });

  it('getDriverTelemetry: DRS=0 → drsEnabled=false, drsAvailable=false', async () => {
    setupDefaultMocks([makeCarData(1, 300, 0)]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);
    const frame = result.frames[0];

    expect(frame.drsEnabled).toBe(false);
    expect(frame.drsAvailable).toBe(false);
  });

  // ── 다운샘플링 ────────────────────────────────────────────────────────────────

  it('getDriverTelemetry: 0.5초 간격으로 다운샘플링된다', async () => {
    // 0~2초 범위의 car_data (0.1초 간격 20개)
    const carData = Array.from({ length: 20 }, (_, i) =>
      makeCarData(i * 0.1, 200 + i),
    );
    setupDefaultMocks(carData);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    // 0~1.9초 범위에서 0.5초 간격 → 0.0, 0.5, 1.0, 1.5 = 4프레임
    expect(result.frames.length).toBe(4);
    expect(result.frames[0].timeOffset).toBe(0);
    expect(result.frames[1].timeOffset).toBe(0.5);
    expect(result.frames[2].timeOffset).toBe(1);
    expect(result.frames[3].timeOffset).toBe(1.5);
  });

  // ── 레이스 시작 전 데이터 필터링 ──────────────────────────────────────────────

  it('getDriverTelemetry: 레이스 시작 전(timeOffset<0) 데이터는 프레임에 포함되지 않는다', async () => {
    setupDefaultMocks([
      makeCarData(-5, 50), // 레이스 시작 5초 전
      makeCarData(-1, 80), // 레이스 시작 1초 전
      makeCarData(1, 200), // 레이스 시작 1초 후
    ]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    // timeOffset >= 0인 데이터만 포함
    result.frames.forEach((frame) => {
      expect(frame.timeOffset).toBeGreaterThanOrEqual(0);
    });
  });

  // ── car_data 비어있으면 빈 배열 ───────────────────────────────────────────────

  it('getDriverTelemetry: car_data가 비어있으면 frames 빈 배열을 반환한다', async () => {
    setupDefaultMocks([]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    expect(result.frames).toEqual([]);
  });

  // ── 드라이버 없으면 에러 ──────────────────────────────────────────────────────

  it('getDriverTelemetry: 드라이버를 찾을 수 없으면 에러를 throw한다', async () => {
    mockClient.fetchLaps.mockResolvedValue([LAP1]);
    mockClient.fetchDrivers.mockResolvedValue([]);
    mockClient.fetchCarData.mockResolvedValue([]);

    await expect(service.getDriverTelemetry(SESSION_KEY, 99)).rejects.toThrow();
  });

  // ── 랩 데이터 없으면 에러 ─────────────────────────────────────────────────────

  it('getDriverTelemetry: lap1 데이터가 없으면 레이스 시작 시간을 결정할 수 없어 에러를 throw한다', async () => {
    mockClient.fetchLaps.mockResolvedValue([]);
    mockClient.fetchDrivers.mockResolvedValue([DRIVER]);
    mockClient.fetchCarData.mockResolvedValue([makeCarData(1, 200)]);

    await expect(
      service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER),
    ).rejects.toThrow();
  });

  // ── 캐시 ──────────────────────────────────────────────────────────────────────

  it('getDriverTelemetry: 같은 드라이버로 두 번 호출하면 API는 한 번만 호출된다', async () => {
    setupDefaultMocks([makeCarData(1, 200)]);

    await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);
    await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    expect(mockClient.fetchCarData).toHaveBeenCalledTimes(1);
  });

  it('getDriverTelemetry: 다른 드라이버는 별도로 캐시된다', async () => {
    setupDefaultMocks([makeCarData(1, 200)]);

    await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);
    // 다른 드라이버 요청
    mockClient.fetchDrivers.mockResolvedValue([
      { ...DRIVER, driver_number: 44, name_acronym: 'HAM' },
    ]);
    await service.getDriverTelemetry(SESSION_KEY, 44);

    expect(mockClient.fetchCarData).toHaveBeenCalledTimes(2);
  });

  // ── 클러스터링: 아웃라이어 제거 ───────────────────────────────────────────────

  it('getDriverTelemetry: 클러스터링으로 아웃라이어 타임스탬프를 무시하고 다수 클러스터의 최솟값을 사용한다', async () => {
    // 드라이버 3명: 2명은 04:07:00 부근, 1명은 03:50:00 (아웃라이어)
    const outlierStart = '2024-04-07T03:50:00.000Z';
    const normalStart1 = '2024-04-07T04:07:00.000Z';
    const normalStart2 = '2024-04-07T04:07:02.000Z';

    mockClient.fetchLaps.mockResolvedValue([
      { ...LAP1, driver_number: 99, date_start: outlierStart },
      { ...LAP1, driver_number: 1, date_start: normalStart1 },
      { ...LAP1, driver_number: 44, date_start: normalStart2 },
    ]);
    mockClient.fetchDrivers.mockResolvedValue([DRIVER]);

    // car_data는 04:07:05 (정상 클러스터 기준 5초 후)
    const carDataDate = new Date(
      new Date(normalStart1).getTime() + 5000,
    ).toISOString();
    mockClient.fetchCarData.mockResolvedValue([
      {
        ...makeCarData(0, 200),
        date: carDataDate,
      },
    ]);

    const result = await service.getDriverTelemetry(SESSION_KEY, DRIVER_NUMBER);

    // 아웃라이어(03:50:00)가 아닌 다수 클러스터(04:07:00)가 기준이므로
    // timeOffset ≈ 5초여야 함 (04:07:05 - 04:07:00)
    // 아웃라이어 기준(03:50:00)이었다면 timeOffset ≈ 1025초가 됨
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames[0].timeOffset).toBeLessThan(10);
  });
});
