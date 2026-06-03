import { CachedOpenF1ClientService } from './cached-openf1-client.service';
import { OpenF1ClientService } from './openf1-client.service';
import { PrismaService } from '../prisma/prisma.service';

// 과거/미래 date_end (끝난 세션 가드 검증용)
const PAST_END = '2020-01-01T00:00:00.000Z';
const FUTURE_END = '2999-01-01T00:00:00.000Z';

describe('CachedOpenF1ClientService — 캐시 레이어', () => {
  let service: CachedOpenF1ClientService;
  let openf1: {
    fetchSessions: jest.Mock;
    fetchLaps: jest.Mock;
    fetchDrivers: jest.Mock;
    fetchLocationWindow: jest.Mock;
  };
  let prisma: {
    openf1Lap: { findUnique: jest.Mock; upsert: jest.Mock };
    openf1Session: { findUnique: jest.Mock; upsert: jest.Mock };
    openf1Location: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(() => {
    openf1 = {
      fetchSessions: jest.fn(),
      fetchLaps: jest.fn(),
      fetchDrivers: jest.fn(),
      fetchLocationWindow: jest.fn(),
    };
    prisma = {
      openf1Lap: { findUnique: jest.fn(), upsert: jest.fn() },
      openf1Session: { findUnique: jest.fn(), upsert: jest.fn() },
      openf1Location: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    service = new CachedOpenF1ClientService(
      openf1 as unknown as OpenF1ClientService,
      prisma as unknown as PrismaService,
    );
  });

  // ── 원본 캐시: 히트/미스 ──────────────────────────────────────────────────────

  it('fetchLaps: RDB 히트 시 OpenF1를 호출하지 않고 저장값을 반환한다', async () => {
    prisma.openf1Lap.findUnique.mockResolvedValue({
      raw: [{ driver_number: 1, lap_number: 1 }],
    });

    const result = await service.fetchLaps({ session_key: 100 });

    expect(result).toHaveLength(1);
    expect(openf1.fetchLaps).not.toHaveBeenCalled();
  });

  it('fetchLaps: RDB 미스 + 끝난 세션이면 OpenF1 호출 후 저장한다', async () => {
    prisma.openf1Lap.findUnique.mockResolvedValue(null);
    openf1.fetchLaps.mockResolvedValue([{ driver_number: 1, lap_number: 1 }]);
    // ensureSessionMeta: 저장된 메타 없음 → OpenF1 세션 조회(과거 종료 = 끝남)
    prisma.openf1Session.findUnique.mockResolvedValue(null);
    openf1.fetchSessions.mockResolvedValue([
      { session_key: 100, date_end: PAST_END },
    ]);
    prisma.openf1Session.upsert.mockResolvedValue({});
    prisma.openf1Lap.upsert.mockResolvedValue({});

    const result = await service.fetchLaps({ session_key: 100 });

    expect(openf1.fetchLaps).toHaveBeenCalledTimes(1);
    expect(prisma.openf1Lap.upsert).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  // ── 규칙 ①: 빈 결과 저장 금지 ────────────────────────────────────────────────

  it('fetchLaps: 빈 결과는 저장하지 않는다(규칙①)', async () => {
    prisma.openf1Lap.findUnique.mockResolvedValue(null);
    openf1.fetchLaps.mockResolvedValue([]); // 회로차단기 fallback 등

    const result = await service.fetchLaps({ session_key: 100 });

    expect(result).toEqual([]);
    expect(prisma.openf1Lap.upsert).not.toHaveBeenCalled();
  });

  // ── 규칙 ④: 끝나지 않은 세션 저장 금지 ──────────────────────────────────────

  it('fetchLaps: 끝나지 않은 세션은 저장하지 않는다(규칙④)', async () => {
    prisma.openf1Lap.findUnique.mockResolvedValue(null);
    openf1.fetchLaps.mockResolvedValue([{ driver_number: 1, lap_number: 1 }]);
    prisma.openf1Session.findUnique.mockResolvedValue(null);
    openf1.fetchSessions.mockResolvedValue([
      { session_key: 100, date_end: FUTURE_END }, // 미래 종료 = 진행 중
    ]);

    const result = await service.fetchLaps({ session_key: 100 });

    expect(result).toHaveLength(1);
    expect(prisma.openf1Lap.upsert).not.toHaveBeenCalled();
  });

  // ── 규칙 ②: 부분 필터는 메모리에서 ──────────────────────────────────────────

  it('fetchLaps: driver_number/lap_number 필터를 메모리에서 적용한다(규칙②)', async () => {
    prisma.openf1Lap.findUnique.mockResolvedValue({
      raw: [
        { driver_number: 1, lap_number: 1 },
        { driver_number: 1, lap_number: 2 },
        { driver_number: 44, lap_number: 1 },
      ],
    });

    const result = await service.fetchLaps({
      session_key: 100,
      driver_number: 1,
      lap_number: 2,
    });

    expect(result).toEqual([{ driver_number: 1, lap_number: 2 }]);
  });

  // ── DB 장애 graceful degradation ────────────────────────────────────────────

  it('fetchLaps: DB 조회 실패 시 OpenF1로 폴백한다', async () => {
    prisma.openf1Lap.findUnique.mockRejectedValue(new Error('db down'));
    openf1.fetchLaps.mockResolvedValue([{ driver_number: 1, lap_number: 1 }]);
    prisma.openf1Session.findUnique.mockRejectedValue(new Error('db down'));

    const result = await service.fetchLaps({ session_key: 100 });

    expect(result).toHaveLength(1);
  });

  // ── fetchSessions: 캐싱 안 함 ────────────────────────────────────────────────

  it('fetchSessions: 캐싱하지 않고 OpenF1 직통한다', async () => {
    openf1.fetchSessions.mockResolvedValue([{ session_key: 100 }]);

    await service.fetchSessions({ year: '2024' });

    expect(openf1.fetchSessions).toHaveBeenCalledWith({ year: '2024' });
  });

  // ── location: 드라이버 단위 캐시 + 빈 결과 가드 ──────────────────────────────

  it('fetchLocation: RDB 히트 시 OpenF1를 호출하지 않는다', async () => {
    prisma.openf1Location.findUnique.mockResolvedValue({
      raw: [{ x: 1, y: 2 }],
    });

    const result = await service.fetchLocation({
      session_key: 100,
      driver_number: 1,
    });

    expect(result).toHaveLength(1);
    expect(openf1.fetchLocationWindow).not.toHaveBeenCalled();
  });

  it('fetchLocation: 빈 결과는 저장하지 않는다(규칙①)', async () => {
    prisma.openf1Location.findUnique.mockResolvedValue(null);
    openf1.fetchLocationWindow.mockResolvedValue([]);

    const result = await service.fetchLocation({
      session_key: 100,
      driver_number: 1,
    });

    expect(result).toEqual([]);
    expect(prisma.openf1Location.upsert).not.toHaveBeenCalled();
  });

  // ── isSessionFinal ───────────────────────────────────────────────────────────

  it('isSessionFinal: 저장된 메타가 있으면 그 값을 반환한다', async () => {
    prisma.openf1Session.findUnique.mockResolvedValue({ isFinal: true });

    expect(await service.isSessionFinal(100)).toBe(true);
    expect(openf1.fetchSessions).not.toHaveBeenCalled();
  });

  it('isSessionFinal: 미보유 시 과거 종료 세션이면 true 로 판정·저장한다', async () => {
    prisma.openf1Session.findUnique.mockResolvedValue(null);
    openf1.fetchSessions.mockResolvedValue([{ date_end: PAST_END }]);
    prisma.openf1Session.upsert.mockResolvedValue({});

    expect(await service.isSessionFinal(100)).toBe(true);
    expect(prisma.openf1Session.upsert).toHaveBeenCalledTimes(1);
  });

  it('isSessionFinal: 진행 중 세션은 false 이며 저장하지 않는다', async () => {
    prisma.openf1Session.findUnique.mockResolvedValue(null);
    openf1.fetchSessions.mockResolvedValue([{ date_end: FUTURE_END }]);

    expect(await service.isSessionFinal(100)).toBe(false);
    expect(prisma.openf1Session.upsert).not.toHaveBeenCalled();
  });
});
