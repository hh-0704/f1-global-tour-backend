import { Test, TestingModule } from '@nestjs/testing';
import { RaceFlagsService } from './race-flags.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import {
  OpenF1RaceControl,
  OpenF1Session,
  OpenF1Lap,
} from '../../common/interfaces/openf1.interface';

const SESSION_KEY = 9472;

const makeSession = (type: string): OpenF1Session => ({
  meeting_key: 1,
  session_key: SESSION_KEY,
  session_name: type,
  session_type: type,
  location: 'Suzuka',
  circuit_short_name: 'suzuka',
  country_name: 'Japan',
  country_code: 'JPN',
  date_start: '2024-04-07T04:00:00.000Z',
  date_end: '2024-04-07T06:00:00.000Z',
  year: 2024,
});

const makeLaps = (maxLap: number): OpenF1Lap[] =>
  Array.from({ length: maxLap }, (_, i) => ({
    meeting_key: 1,
    session_key: SESSION_KEY,
    driver_number: 1,
    lap_number: i + 1,
    date_start: '2024-04-07T04:07:00.000Z',
    lap_duration: 90,
    is_pit_out_lap: false,
    duration_sector_1: 28,
    duration_sector_2: 32,
    duration_sector_3: 30,
  }));

const makeRcMsg = (
  overrides: Partial<OpenF1RaceControl> & { date: string },
): OpenF1RaceControl => ({
  meeting_key: 1,
  session_key: SESSION_KEY,
  driver_number: null,
  lap_number: null,
  category: 'Flag',
  flag: null,
  scope: 'Track',
  sector: null,
  message: '',
  ...overrides,
});

describe('RaceFlagsService', () => {
  let service: RaceFlagsService;
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
        RaceFlagsService,
        { provide: CachedOpenF1ClientService, useValue: mockClient },
      ],
    }).compile();

    service = module.get<RaceFlagsService>(RaceFlagsService);
  });

  // ── sessionType 매핑 ──────────────────────────────────────────────────────────

  it.each([
    ['Race', 'RACE'],
    ['Sprint', 'RACE'],
    ['Sprint Shootout', 'RACE'],
    ['Qualifying', 'QUALIFYING'],
    ['Practice 1', 'PRACTICE'],
  ])(
    'getRaceFlags: session_type=%s → sessionType=%s',
    async (openF1Type, expected) => {
      mockClient.fetchSessions.mockResolvedValue([makeSession(openF1Type)]);
      mockClient.fetchRaceControl.mockResolvedValue([]);
      mockClient.fetchLaps.mockResolvedValue([]);

      const result = await service.getRaceFlags(SESSION_KEY);
      expect(result.sessionType).toBe(expected);
    },
  );

  // ── 레이스: lapFlags 생성 ─────────────────────────────────────────────────────

  it('getRaceFlags: 레이스 세션에서 플래그 이벤트 없으면 모든 랩이 NONE이다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchRaceControl.mockResolvedValue([]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(5));

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.totalLaps).toBe(5);
    expect(result.lapFlags).toHaveLength(5);
    expect(result.lapFlags.every((f) => f === 'NONE')).toBe(true);
    expect(result.totalMinutes).toBe(0);
    expect(result.minuteFlags).toEqual([]);
  });

  it('getRaceFlags: SC 이벤트가 랩3에 발생하면 랩3 이후 SC, GREEN 이후 NONE', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(6));
    mockClient.fetchRaceControl.mockResolvedValue([
      makeRcMsg({
        date: '2024-04-07T04:10:00.000Z',
        lap_number: 3,
        message: 'SAFETY CAR DEPLOYED',
        category: 'SafetyCar',
      }),
      makeRcMsg({
        date: '2024-04-07T04:15:00.000Z',
        lap_number: 5,
        flag: 'GREEN',
        message: 'GREEN FLAG',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);

    // 랩1,2 = NONE, 랩3,4 = SC, 랩5,6 = NONE
    expect(result.lapFlags[0]).toBe('NONE');
    expect(result.lapFlags[1]).toBe('NONE');
    expect(result.lapFlags[2]).toBe('SC');
    expect(result.lapFlags[3]).toBe('SC');
    expect(result.lapFlags[4]).toBe('NONE');
    expect(result.lapFlags[5]).toBe('NONE');
  });

  it('getRaceFlags: RED FLAG 이벤트를 올바르게 분류한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));
    mockClient.fetchRaceControl.mockResolvedValue([
      makeRcMsg({
        date: '2024-04-07T04:08:00.000Z',
        lap_number: 2,
        flag: 'RED',
        message: 'RED FLAG',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.lapFlags[0]).toBe('NONE');
    expect(result.lapFlags[1]).toBe('RED');
    expect(result.lapFlags[2]).toBe('RED');
  });

  it('getRaceFlags: VSC 이벤트를 올바르게 분류한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));
    mockClient.fetchRaceControl.mockResolvedValue([
      makeRcMsg({
        date: '2024-04-07T04:08:00.000Z',
        lap_number: 1,
        message: 'VIRTUAL SAFETY CAR DEPLOYED',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.lapFlags[0]).toBe('VSC');
    expect(result.lapFlags[1]).toBe('VSC');
    expect(result.lapFlags[2]).toBe('VSC');
  });

  // ── scope 필터링 ──────────────────────────────────────────────────────────────

  it('getRaceFlags: scope가 Track이 아닌 메시지는 무시한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));
    mockClient.fetchRaceControl.mockResolvedValue([
      makeRcMsg({
        date: '2024-04-07T04:08:00.000Z',
        lap_number: 1,
        flag: 'YELLOW',
        message: 'YELLOW FLAG',
        scope: 'Sector',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);
    expect(result.lapFlags.every((f) => f === 'NONE')).toBe(true);
  });

  it('getRaceFlags: Flag/SafetyCar가 아닌 카테고리는 무시한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));
    mockClient.fetchRaceControl.mockResolvedValue([
      makeRcMsg({
        date: '2024-04-07T04:08:00.000Z',
        lap_number: 1,
        message: 'SAFETY CAR',
        category: 'Other',
        scope: 'Track',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);
    expect(result.lapFlags.every((f) => f === 'NONE')).toBe(true);
  });

  // ── 퀄리파잉: minuteFlags ────────────────────────────────────────────────────

  it('getRaceFlags: 퀄리파잉 세션에서 minuteFlags를 분 단위로 생성한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Qualifying')]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(5));
    mockClient.fetchRaceControl.mockResolvedValue([
      // 세션 시작(04:00)으로부터 30분 경과 시점에 RED FLAG
      makeRcMsg({
        date: '2024-04-07T04:30:00.000Z',
        flag: 'RED',
        message: 'RED FLAG',
      }),
    ]);

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.sessionType).toBe('QUALIFYING');
    expect(result.totalMinutes).toBe(120); // 04:00 ~ 06:00 = 120분
    expect(result.minuteFlags).toHaveLength(120);
    // 0~29분은 NONE, 30~119분은 RED
    expect(result.minuteFlags[29]).toBe('NONE');
    expect(result.minuteFlags[30]).toBe('RED');
    expect(result.minuteFlags[119]).toBe('RED');
    // lapFlags도 함께 생성
    expect(result.lapFlags).toHaveLength(5);
  });

  // ── 레이스에서는 minuteFlags 미생성 ──────────────────────────────────────────

  it('getRaceFlags: 레이스 세션에서는 minuteFlags가 빈 배열이다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchRaceControl.mockResolvedValue([]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.totalMinutes).toBe(0);
    expect(result.minuteFlags).toEqual([]);
  });

  // ── laps 비어있으면 totalLaps=0, lapFlags=[] ─────────────────────────────────

  it('getRaceFlags: laps가 비어있으면 totalLaps=0, lapFlags=[]을 반환한다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchRaceControl.mockResolvedValue([]);
    mockClient.fetchLaps.mockResolvedValue([]);

    const result = await service.getRaceFlags(SESSION_KEY);

    expect(result.totalLaps).toBe(0);
    expect(result.lapFlags).toEqual([]);
  });

  // ── 캐시 ──────────────────────────────────────────────────────────────────────

  it('getRaceFlags: 같은 sessionKey로 두 번 호출하면 API는 한 번만 호출된다', async () => {
    mockClient.fetchSessions.mockResolvedValue([makeSession('Race')]);
    mockClient.fetchRaceControl.mockResolvedValue([]);
    mockClient.fetchLaps.mockResolvedValue(makeLaps(3));

    await service.getRaceFlags(SESSION_KEY);
    await service.getRaceFlags(SESSION_KEY);

    expect(mockClient.fetchSessions).toHaveBeenCalledTimes(1);
  });
});
