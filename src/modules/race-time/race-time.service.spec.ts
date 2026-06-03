import { Test, TestingModule } from '@nestjs/testing';
import { RaceTimeService } from './race-time.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OpenF1Lap } from '../../common/interfaces/openf1.interface';

// 최소 필드만 갖춘 랩 생성 헬퍼
function lap(
  driver_number: number,
  lap_number: number,
  date_start: string | null,
): OpenF1Lap {
  return {
    meeting_key: 1,
    session_key: 9472,
    driver_number,
    lap_number,
    date_start: date_start as string,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    lap_duration: null,
    is_pit_out_lap: false,
  };
}

describe('RaceTimeService', () => {
  let service: RaceTimeService;
  let client: { fetchLaps: jest.Mock; isSessionFinal: jest.Mock };
  let storedMs: bigint | null;

  beforeEach(async () => {
    client = {
      fetchLaps: jest.fn(),
      // 끝난 세션 → raceStart 저장 트리거
      isSessionFinal: jest.fn().mockResolvedValue(true),
    };
    storedMs = null;

    // race_start_cache 를 인메모리로 흉내: upsert 시 저장, findUnique 시 반환
    const mockPrisma = {
      raceStartCache: {
        findUnique: jest.fn(() =>
          Promise.resolve(storedMs == null ? null : { raceStartMs: storedMs }),
        ),
        upsert: jest.fn((args: { create: { raceStartMs: bigint } }) => {
          storedMs = args.create.raceStartMs;
          return Promise.resolve({});
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaceTimeService,
        { provide: CachedOpenF1ClientService, useValue: client },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(RaceTimeService);
  });

  // ── computeRaceStartMs ──────────────────────────────────────────────────────

  it('drivers 가 ~동일 시각에 lap1 출발 → 클러스터 최솟값을 반환', () => {
    const base = Date.parse('2024-04-07T05:03:00Z');
    const laps: OpenF1Lap[] = [];
    for (let d = 1; d <= 5; d++) {
      laps.push(lap(d, 1, new Date(base + d * 1000).toISOString())); // 1~5s jitter
    }
    // 최솟값 = base + 1000 (드라이버1)
    expect(service.computeRaceStartMs(laps)).toBe(base + 1000);
  });

  it('레드플래그 재시작: 큰 클러스터(다수)의 최솟값을 선택한다', () => {
    const real = Date.parse('2024-04-07T05:03:00Z'); // 실제 출발 (다수)
    const laps: OpenF1Lap[] = [];
    // 소수(2명): 30초 이른 outlier 클러스터
    laps.push(lap(1, 1, new Date(real - 30000).toISOString()));
    laps.push(lap(2, 1, new Date(real - 29000).toISOString()));
    // 다수(8명): 실제 출발 근처 (10초 이내 jitter)
    for (let d = 3; d <= 10; d++) {
      laps.push(lap(d, 1, new Date(real + (d - 3) * 1000).toISOString()));
    }
    // 다수 클러스터의 최솟값 = real (드라이버3)
    expect(service.computeRaceStartMs(laps)).toBe(real);
  });

  it('드라이버별 최소 lap_number 의 시각을 사용한다(lap2 무시)', () => {
    const t1 = Date.parse('2024-04-07T05:03:00Z');
    const t2 = Date.parse('2024-04-07T05:04:30Z');
    const laps = [
      lap(1, 2, new Date(t2).toISOString()),
      lap(1, 1, new Date(t1).toISOString()), // 순서 무관, lap1 채택
    ];
    expect(service.computeRaceStartMs(laps)).toBe(t1);
  });

  it('null/유효하지 않은 date_start 는 무시한다', () => {
    const t = Date.parse('2024-04-07T05:03:00Z');
    const laps = [lap(1, 1, null), lap(2, 1, new Date(t).toISOString())];
    expect(service.computeRaceStartMs(laps)).toBe(t);
  });

  it('유효 랩이 없으면 0 을 반환한다', () => {
    expect(service.computeRaceStartMs([])).toBe(0);
    expect(service.computeRaceStartMs([lap(1, 1, null)])).toBe(0);
  });

  // ── getRaceStartMs (fetch + 캐시) ───────────────────────────────────────────

  it('getRaceStartMs: fetchLaps 결과로 계산하고, 두 번째 호출은 캐시를 쓴다', async () => {
    const t = Date.parse('2024-04-07T05:03:00Z');
    client.fetchLaps.mockResolvedValue([lap(1, 1, new Date(t).toISOString())]);

    const first = await service.getRaceStartMs(9472);
    const second = await service.getRaceStartMs(9472);

    expect(first).toBe(t);
    expect(second).toBe(t);
    expect(client.fetchLaps).toHaveBeenCalledTimes(1); // 캐시 적중
  });

  // ── toRelativeSeconds (0점) ─────────────────────────────────────────────────

  it('toRelativeSeconds: raceStartMs 기준 상대 초로 변환(pre-start 음수)', () => {
    const raceStart = Date.parse('2024-04-07T05:03:00Z');
    expect(service.toRelativeSeconds(raceStart, '2024-04-07T05:03:00Z')).toBe(
      0,
    );
    expect(
      service.toRelativeSeconds(raceStart, '2024-04-07T05:03:10.5Z'),
    ).toBeCloseTo(10.5, 6);
    expect(service.toRelativeSeconds(raceStart, '2024-04-07T05:02:59Z')).toBe(
      -1,
    ); // pre-start
  });
});
