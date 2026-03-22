/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { LapsService } from '../laps/laps.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import {
  OpenF1Driver,
  OpenF1Lap,
  OpenF1Interval,
  OpenF1Stint,
} from '../../common/interfaces/openf1.interface';

// ─── 테스트용 픽스처 ───────────────────────────────────────────────────────────

const SESSION_KEY = 9472;

const RACE_START = '2024-04-07T04:07:00.000Z';
const t = (offsetSec: number) =>
  new Date(new Date(RACE_START).getTime() + offsetSec * 1000).toISOString();

const DRIVERS: OpenF1Driver[] = [
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    full_name: 'Max VERSTAPPEN',
    name_acronym: 'VER',
    team_name: 'Red Bull Racing',
    team_colour: '3671C6',
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    full_name: 'Lewis HAMILTON',
    name_acronym: 'HAM',
    team_name: 'Mercedes',
    team_colour: '27F4D2',
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    full_name: 'Charles LECLERC',
    name_acronym: 'LEC',
    team_name: 'Ferrari',
    team_colour: 'E8002D',
  },
];

const LAPS: OpenF1Lap[] = [
  // VER: 랩1(90s) — sector1=fastest(2051), sector2=normal(2048), sector3=personal_best(2049)
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    lap_number: 1,
    date_start: t(0),
    lap_duration: 90,
    is_pit_out_lap: false,
    duration_sector_1: 28,
    duration_sector_2: 32,
    duration_sector_3: 30,
    segments_sector_1: [2051, 2048],
    segments_sector_2: [2048],
    segments_sector_3: [2049],
  },
  // VER: 랩2(89s) — sector2=fastest(2051)
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    lap_number: 2,
    date_start: t(90),
    lap_duration: 89,
    is_pit_out_lap: false,
    duration_sector_1: 27,
    duration_sector_2: 31,
    duration_sector_3: 31,
    segments_sector_1: [2049],
    segments_sector_2: [2051],
    segments_sector_3: [2048],
  },
  // HAM: 랩1(93s), 랩2(91s) — 모두 normal(2048)
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    lap_number: 1,
    date_start: t(0),
    lap_duration: 93,
    is_pit_out_lap: false,
    duration_sector_1: 29,
    duration_sector_2: 33,
    duration_sector_3: 31,
    segments_sector_1: [2048],
    segments_sector_2: [2048],
    segments_sector_3: [2048],
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    lap_number: 2,
    date_start: t(93),
    lap_duration: 91,
    is_pit_out_lap: false,
    duration_sector_1: 28,
    duration_sector_2: 32,
    duration_sector_3: 31,
    segments_sector_1: [2048],
    segments_sector_2: [2049],
    segments_sector_3: [2048],
  },
  // LEC: 랩1(91s) 정상, 랩2 DNF(null)
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    lap_number: 1,
    date_start: t(0),
    lap_duration: 91,
    is_pit_out_lap: false,
    duration_sector_1: 28,
    duration_sector_2: 32,
    duration_sector_3: 31,
    segments_sector_1: [2048],
    segments_sector_2: [2048],
    segments_sector_3: [2048],
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    lap_number: 2,
    date_start: t(91),
    lap_duration: null,
    is_pit_out_lap: false,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
  },
];

const INTERVALS: OpenF1Interval[] = [
  // 레이스 시작 전 (프레임 생성 제외 대상)
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    date: t(-10),
    gap_to_leader: 0,
    interval: 0,
  },
  // 랩1 중 (~30s) — currentLap=1, displayDataLap=0 → lapTime '--:--:---'
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    date: t(30),
    gap_to_leader: 0,
    interval: 0,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    date: t(32),
    gap_to_leader: 3.2,
    interval: 3.2,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    date: t(34),
    gap_to_leader: 1.5,
    interval: 1.5,
  },
  // 랩2 중 (~120s) — currentLap=2, displayDataLap=1 → 랩1 완료 데이터
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    date: t(120),
    gap_to_leader: 0,
    interval: 0,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    date: t(122),
    gap_to_leader: 5.8,
    interval: 2.6,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    date: t(124),
    gap_to_leader: 2.9,
    interval: 1.4,
  },
  // 레이스 종료 후 (~200s) — VER 랩2 완주: t(90+89)=t(179), displayDataLap=maxLap=2
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    date: t(200),
    gap_to_leader: 0,
    interval: 0,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    date: t(202),
    gap_to_leader: 7.1,
    interval: 7.1,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    date: t(204),
    gap_to_leader: 3.5,
    interval: 3.5,
  },
];

const STINTS: OpenF1Stint[] = [
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    stint_number: 1,
    lap_start: 1,
    lap_end: 2,
    compound: 'SOFT',
    tyre_age_at_start: 0,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 44,
    stint_number: 1,
    lap_start: 1,
    lap_end: 2,
    compound: 'MEDIUM',
    tyre_age_at_start: 0,
  },
  {
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 16,
    stint_number: 1,
    lap_start: 1,
    lap_end: 1,
    compound: 'HARD',
    tyre_age_at_start: 0,
  },
];

// ─── 공통 mock 설정 헬퍼 ──────────────────────────────────────────────────────

function setupDefaultMocks(mockClient: jest.Mocked<CachedOpenF1ClientService>) {
  mockClient.fetchLaps.mockResolvedValue(LAPS);
  mockClient.fetchIntervals.mockResolvedValue(INTERVALS);
  mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
  mockClient.fetchStints.mockResolvedValue(STINTS);
}

// ─── SessionsService 테스트 ───────────────────────────────────────────────────

describe('SessionsService', () => {
  let service: SessionsService;
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
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: CachedOpenF1ClientService, useValue: mockClient },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  // ── 1. getSessions ──────────────────────────────────────────────────────────
  it('getSessions: 연도·국가 필터를 파라미터로 전달하고 OpenF1 응답을 그대로 반환한다', async () => {
    const raw = [
      {
        session_key: SESSION_KEY,
        session_name: 'Race',
        country_name: 'Japan',
        year: 2024,
      },
    ];
    mockClient.fetchSessions.mockResolvedValue(raw as any);

    const result = await service.getSessions('Japan', '2024');

    expect(mockClient.fetchSessions).toHaveBeenCalledWith({
      country_name: 'Japan',
      year: '2024',
    });
    expect(result).toEqual(raw);
  });

  // ── 2. getSessionDrivers ────────────────────────────────────────────────────
  it('getSessionDrivers: 드라이버 데이터를 변환해서 반환한다 (name, teamColor 포함)', async () => {
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);

    const result = await service.getSessionDrivers(SESSION_KEY);

    expect(result).toHaveLength(3);
    // F1TransformationsUtil.transformDriverData: name_acronym → name, team_colour → teamColor
    expect(result[0]).toMatchObject({
      name: 'VER',
      teamColor: expect.stringContaining('3671C6'),
    });
    expect(mockClient.fetchDrivers).toHaveBeenCalledWith({
      session_key: SESSION_KEY,
    });
  });

  // ── 3. getDriverTimings: 프레임 배열 구조 검증 ──────────────────────────────
  it('getDriverTimings: frames 배열을 반환하고 각 프레임이 timeOffset·currentLap·drivers를 갖는다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);

    expect(Array.isArray(frames)).toBe(true);
    expect(frames.length).toBeGreaterThan(0);
    frames.forEach((frame) => {
      expect(typeof frame.timeOffset).toBe('number');
      expect(typeof frame.currentLap).toBe('number');
      expect(Array.isArray(frame.drivers)).toBe(true);
    });
  });

  // ── 4. 레이스 시작 전 interval 프레임 제외 ───────────────────────────────────
  it('getDriverTimings: 레이스 시작(t=0) 이전 interval은 프레임에 포함되지 않는다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);

    frames.forEach((frame) => {
      expect(frame.timeOffset).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 5. DriverDisplayRow 전체 필드 검증 ──────────────────────────────────────
  it('getDriverTimings: 각 드라이버 행이 position·driverCode·interval·currentLapTime·tireInfo·miniSector를 갖는다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    const firstFrame = frames[0];

    firstFrame.drivers.forEach((row) => {
      expect(row).toHaveProperty('position');
      expect(row).toHaveProperty('driverCode');
      expect(row).toHaveProperty('interval');
      expect(row).toHaveProperty('currentLapTime');
      expect(row.tireInfo).toMatchObject({
        compound: expect.any(String),
        lapCount: expect.any(Number),
        pitStops: expect.any(Number),
      });
      expect(['sector1', 'sector2', 'sector3']).toEqual(
        expect.arrayContaining(Object.keys(row.miniSector)),
      );
    });
  });

  // ── 6. 선두 드라이버 interval = "--" ─────────────────────────────────────────
  it('getDriverTimings: 선두 드라이버(1위)의 interval은 "--"이다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    const lastFrame = frames[frames.length - 1];
    const leader = lastFrame.drivers.find((d) => d.position === 1);

    expect(leader).toBeDefined();
    expect(leader!.interval).toBe('--');
  });

  // ── 7. 랩1 진행 중 currentLapTime = "--:--:---" ──────────────────────────────
  it('getDriverTimings: 랩1 진행 중(displayDataLap=0) 프레임의 currentLapTime은 "--:--:---"이다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // 픽스처 기준 t=30s는 currentLap=1 → displayDataLap=0
    const lap1Frame = frames.find((f) => f.currentLap === 1);

    expect(lap1Frame).toBeDefined();
    lap1Frame!.drivers.forEach((row) => {
      expect(row.currentLapTime).toBe('--:--:---');
    });
  });

  // ── 8. miniSector 성능 판정 ──────────────────────────────────────────────────
  it('getDriverTimings: miniSector 성능이 segments에 따라 fastest/personal_best/normal으로 판정된다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // 랩1 완료 후 프레임(displayDataLap=1)에서 VER 확인
    // VER 랩1: sector1=[2051] → fastest, sector2=[2048] → normal, sector3=[2049] → personal_best
    const lap2Frame = frames.find((f) => f.currentLap === 2);
    expect(lap2Frame).toBeDefined();
    const ver = lap2Frame!.drivers.find((d) => d.driverCode === 'VER');
    expect(ver).toBeDefined();
    expect(ver!.miniSector.sector1).toBe('fastest');
    expect(ver!.miniSector.sector2).toBe('normal');
    expect(ver!.miniSector.sector3).toBe('personal_best');
  });

  // ── 9. bestLapTime은 이전 랩 중 최소값 ──────────────────────────────────────
  it('getDriverTimings: bestLapTime은 해당 시점까지 완료한 랩 중 최소값이다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // 레이스 종료 후 프레임(displayDataLap=2): VER 랩1=90s, 랩2=89s → bestLap=89s → "1:29.000"
    const endFrame = frames.find(
      (f) => f.currentLap === 2 && f.timeOffset > 179,
    );
    expect(endFrame).toBeDefined();
    const ver = endFrame!.drivers.find((d) => d.driverCode === 'VER');
    expect(ver).toBeDefined();
    expect(ver!.bestLapTime).toBe('1:29.000');
  });

  // ── 10. tireInfo compound 정상화 ─────────────────────────────────────────────
  it('getDriverTimings: 알 수 없는 compound는 "UNKNOWN"으로 정상화된다', async () => {
    const stintsWithUnknown: OpenF1Stint[] = [
      ...STINTS,
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 16,
        stint_number: 2,
        lap_start: 2,
        lap_end: 2,
        compound: 'HYPERSOFT',
        tyre_age_at_start: 0,
      },
    ];
    mockClient.fetchLaps.mockResolvedValue(LAPS);
    mockClient.fetchIntervals.mockResolvedValue(INTERVALS);
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.fetchStints.mockResolvedValue(stintsWithUnknown);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    const lap2Frame = frames.find((f) => f.currentLap === 2);
    const lec = lap2Frame?.drivers.find((d) => d.driverCode === 'LEC');
    expect(lec?.tireInfo.compound).toBe('UNKNOWN');
  });

  // ── 11. DNF 드라이버 처리 ────────────────────────────────────────────────────
  it('getDriverTimings: DNF 드라이버의 currentLapTime은 "DNF"이고 miniSector는 모두 "none"이다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // 레이스 종료 후 프레임(displayDataLap=2)에서 LEC DNF 확인
    const endFrames = frames.filter((f) => f.timeOffset > 179);
    let foundDnf = false;
    for (const frame of endFrames) {
      const lec = frame.drivers.find((d) => d.driverCode === 'LEC');
      if (lec && lec.currentLapTime === 'DNF') {
        expect(lec.miniSector.sector1).toBe('none');
        expect(lec.miniSector.sector2).toBe('none');
        expect(lec.miniSector.sector3).toBe('none');
        foundDnf = true;
        break;
      }
    }
    expect(foundDnf).toBe(true);
  });

  // ── 12. 2초 윈도우 그룹핑 ────────────────────────────────────────────────────
  it('getDriverTimings: 2초 이내에 들어온 interval들은 하나의 프레임으로 그룹핑된다', async () => {
    // 0.5초 간격으로 연속된 interval 5개 → 같은 윈도우이므로 1개 프레임만 생성
    const denseIntervals: OpenF1Interval[] = [
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 1,
        date: t(30),
        gap_to_leader: 0,
        interval: 0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 44,
        date: t(30.5),
        gap_to_leader: 3.0,
        interval: 3.0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 16,
        date: t(31),
        gap_to_leader: 1.5,
        interval: 1.5,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 1,
        date: t(31.5),
        gap_to_leader: 0,
        interval: 0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 44,
        date: t(32),
        gap_to_leader: 3.1,
        interval: 3.1,
      },
    ];
    mockClient.fetchLaps.mockResolvedValue(LAPS);
    mockClient.fetchIntervals.mockResolvedValue(denseIntervals);
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.fetchStints.mockResolvedValue(STINTS);

    const { frames } = await service.getDriverTimings(SESSION_KEY);

    // 30~32s 구간(2초 내)은 프레임 1개
    const windowFrames = frames.filter(
      (f) => f.timeOffset >= 30 && f.timeOffset < 32,
    );
    expect(windowFrames.length).toBe(1);
  });

  // ── 13. intervals 비어있으면 frames 빈 배열 ──────────────────────────────────
  it('getDriverTimings: intervals가 비어있으면 frames 빈 배열을 반환한다', async () => {
    mockClient.fetchLaps.mockResolvedValue(LAPS);
    mockClient.fetchIntervals.mockResolvedValue([]);
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.fetchStints.mockResolvedValue(STINTS);

    const { frames } = await service.getDriverTimings(SESSION_KEY);

    expect(frames).toEqual([]);
  });

  // ── 14. laps 비어있으면 frames 빈 배열 ──────────────────────────────────────
  it('getDriverTimings: laps가 비어있으면 frames 빈 배열을 반환한다', async () => {
    mockClient.fetchLaps.mockResolvedValue([]);
    mockClient.fetchIntervals.mockResolvedValue(INTERVALS);
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.fetchStints.mockResolvedValue(STINTS);

    const { frames } = await service.getDriverTimings(SESSION_KEY);

    expect(frames).toEqual([]);
  });

  // ── 15. 인메모리 캐시 재사용 ─────────────────────────────────────────────────
  it('getDriverTimings: 같은 sessionKey로 두 번 호출하면 OpenF1 API는 한 번만 호출된다', async () => {
    setupDefaultMocks(mockClient);

    await service.getDriverTimings(SESSION_KEY);
    await service.getDriverTimings(SESSION_KEY);

    expect(mockClient.fetchLaps).toHaveBeenCalledTimes(1);
  });

  // ── 16. startReplay: 응답 구조 검증 ─────────────────────────────────────────
  it('startReplay: driverCount·dataStats(lapsCount, intervalsCount, stintsCount)를 포함한 응답을 반환한다', async () => {
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.preloadReplayData.mockResolvedValue({
      drivers: DRIVERS,
      laps: LAPS,
      intervals: INTERVALS,
      stints: STINTS,
    });

    const result = await service.startReplay(SESSION_KEY);

    expect(result.data.driverCount).toBe(3);
    expect(result.data.dataStats.lapsCount).toBe(LAPS.length);
    expect(result.data.dataStats.intervalsCount).toBe(INTERVALS.length);
    expect(result.data.dataStats.stintsCount).toBe(STINTS.length);
  });

  // ── 17. getSessions 필터 없이 호출 ──────────────────────────────────────────
  it('getSessions: 필터 없이 호출하면 fetchSessions에 빈 파라미터 객체가 전달된다', async () => {
    mockClient.fetchSessions.mockResolvedValue([]);

    await service.getSessions();

    expect(mockClient.fetchSessions).toHaveBeenCalledWith({});
  });

  // ── 18. 2위 이하 드라이버 interval 포맷 ─────────────────────────────────────
  it('getDriverTimings: 2위 이하 드라이버의 interval은 "+X.XXX" 형식이다', async () => {
    setupDefaultMocks(mockClient);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // t=120s 프레임: HAM gap_to_leader=5.8 → "+5.800", LEC gap_to_leader=2.9 → "+2.900"
    const midFrame = frames.find(
      (f) => f.timeOffset >= 120 && f.timeOffset < 179,
    );
    expect(midFrame).toBeDefined();

    const nonLeaders = midFrame!.drivers.filter(
      (d) => d.position > 1 && d.currentLapTime !== 'DNF',
    );
    expect(nonLeaders.length).toBeGreaterThan(0);
    nonLeaders.forEach((row) => {
      expect(row.interval).toMatch(/^\+\d+\.\d{3}$/);
    });
  });

  // ── 19. tireInfo.pitStops 계산 ───────────────────────────────────────────────
  it('getDriverTimings: 완료된 stint 수가 tireInfo.pitStops에 반영된다', async () => {
    // HAM이 랩1 → 랩2 전환 시 피트인(stint 1 종료, stint 2 시작)
    const stintsWithPit: OpenF1Stint[] = [
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 1,
        stint_number: 1,
        lap_start: 1,
        lap_end: 2,
        compound: 'SOFT',
        tyre_age_at_start: 0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 44,
        stint_number: 1,
        lap_start: 1,
        lap_end: 1,
        compound: 'SOFT',
        tyre_age_at_start: 0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 44,
        stint_number: 2,
        lap_start: 2,
        lap_end: 2,
        compound: 'MEDIUM',
        tyre_age_at_start: 0,
      },
      {
        meeting_key: 1,
        session_key: SESSION_KEY,
        driver_number: 16,
        stint_number: 1,
        lap_start: 1,
        lap_end: 1,
        compound: 'HARD',
        tyre_age_at_start: 0,
      },
    ];
    mockClient.fetchLaps.mockResolvedValue(LAPS);
    mockClient.fetchIntervals.mockResolvedValue(INTERVALS);
    mockClient.fetchDrivers.mockResolvedValue(DRIVERS);
    mockClient.fetchStints.mockResolvedValue(stintsWithPit);

    const { frames } = await service.getDriverTimings(SESSION_KEY);
    // 레이스 종료 후 프레임(displayDataLap=2): HAM stint1(lap_end=1) < lapNum(2) → pitStops=1
    const endFrame = frames.find((f) => f.timeOffset > 179);
    expect(endFrame).toBeDefined();
    const ham = endFrame!.drivers.find((d) => d.driverCode === 'HAM');
    expect(ham).toBeDefined();
    expect(ham!.tireInfo.pitStops).toBe(1);
    expect(ham!.tireInfo.compound).toBe('MEDIUM'); // 현재 stint의 compound
    // VER는 피트 없음 → pitStops=0
    const ver = endFrame!.drivers.find((d) => d.driverCode === 'VER');
    expect(ver!.tireInfo.pitStops).toBe(0);
  });
});

// ─── LapsService 테스트 ───────────────────────────────────────────────────────

describe('LapsService', () => {
  let service: LapsService;
  let mockClient: jest.Mocked<CachedOpenF1ClientService>;

  const RAW_LAPS = [
    {
      session_key: SESSION_KEY,
      driver_number: 1,
      lap_number: 1,
      lap_duration: 90.123,
      date_start: t(0),
      is_pit_out_lap: false,
      duration_sector_1: 28.1,
      duration_sector_2: 32.0,
      duration_sector_3: 30.0,
    },
    {
      session_key: SESSION_KEY,
      driver_number: 1,
      lap_number: 2,
      lap_duration: 89.456,
      date_start: t(90),
      is_pit_out_lap: false,
      duration_sector_1: 27.5,
      duration_sector_2: 31.0,
      duration_sector_3: 30.9,
    },
    // pit out lap — lap_duration이 있어도 isDNF=false
    {
      session_key: SESSION_KEY,
      driver_number: 44,
      lap_number: 2,
      lap_duration: 105.0,
      date_start: t(93),
      is_pit_out_lap: true,
      duration_sector_1: 35.0,
      duration_sector_2: 38.0,
      duration_sector_3: 32.0,
    },
    // DNF — lap_duration=null, is_pit_out_lap=false
    {
      session_key: SESSION_KEY,
      driver_number: 16,
      lap_number: 2,
      lap_duration: null,
      date_start: t(91),
      is_pit_out_lap: false,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
    },
  ];

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
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LapsService,
        { provide: CachedOpenF1ClientService, useValue: mockClient },
      ],
    }).compile();

    service = module.get<LapsService>(LapsService);
  });

  // ── 17. 기본 변환 ────────────────────────────────────────────────────────────
  it('getSessionLaps: snake_case 필드를 camelCase로 변환하고 lapTime·sectors·driverNumber를 반환한다', async () => {
    mockClient.fetchLaps.mockResolvedValue(RAW_LAPS as any);

    const result = await service.getSessionLaps(SESSION_KEY);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      lapNumber: 1,
      lapTime: 90.123,
      driverNumber: 1,
      sectors: { sector1: 28.1, sector2: 32.0, sector3: 30.0 },
      isPitOutLap: false,
      isDNF: false,
    });
  });

  // ── 18. isDNF 판정 ───────────────────────────────────────────────────────────
  it('getSessionLaps: lap_duration=null이고 is_pit_out_lap=false이면 isDNF=true이다', async () => {
    mockClient.fetchLaps.mockResolvedValue(RAW_LAPS as any);

    const result = await service.getSessionLaps(SESSION_KEY);
    const dnfLap = result.find(
      (l) => l.driverNumber === 16 && l.lapNumber === 2,
    );

    expect(dnfLap).toBeDefined();
    expect(dnfLap!.isDNF).toBe(true);
    expect(dnfLap!.lapTime).toBeNull();
  });

  // ── 19. pit out lap isDNF=false ──────────────────────────────────────────────
  it('getSessionLaps: is_pit_out_lap=true이면 lap_duration 유무와 관계없이 isDNF=false이다', async () => {
    mockClient.fetchLaps.mockResolvedValue(RAW_LAPS as any);

    const result = await service.getSessionLaps(SESSION_KEY);
    const pitLap = result.find(
      (l) => l.driverNumber === 44 && l.lapNumber === 2,
    );

    expect(pitLap).toBeDefined();
    expect(pitLap!.isPitOutLap).toBe(true);
    expect(pitLap!.isDNF).toBe(false);
  });

  // ── 20. lapNumber 필터 파라미터 전달 ────────────────────────────────────────
  it('getSessionLaps: lapNumber를 전달하면 lap_number 필터가 fetchLaps 파라미터에 포함된다', async () => {
    mockClient.fetchLaps.mockResolvedValue([RAW_LAPS[0]] as any);

    await service.getSessionLaps(SESSION_KEY, 1);

    expect(mockClient.fetchLaps).toHaveBeenCalledWith({
      session_key: SESSION_KEY,
      lap_number: 1,
    });
  });
});
