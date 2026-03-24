import { CircuitBreakerService, CircuitBreakerState } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  // ── 초기 상태 ─────────────────────────────────────────────────────────────────

  it('초기 상태는 CLOSED이고 모든 카운터가 0이다', () => {
    const stats = service.getStats();
    expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    expect(stats.failureCount).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });

  // ── 성공 동작 ─────────────────────────────────────────────────────────────────

  it('execute: 성공 시 결과를 반환하고 successfulRequests를 증가시킨다', async () => {
    const result = await service.execute(async () => 'ok');

    expect(result).toBe('ok');
    const stats = service.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(0);
    expect(stats.state).toBe(CircuitBreakerState.CLOSED);
  });

  // ── 실패 카운트 ───────────────────────────────────────────────────────────────

  it('execute: 실패 시 failureCount를 증가시키고 에러를 그대로 throw한다', async () => {
    await expect(
      service.execute(async () => { throw new Error('fail'); }),
    ).rejects.toThrow('fail');

    const stats = service.getStats();
    expect(stats.failureCount).toBe(1);
    expect(stats.failedRequests).toBe(1);
    expect(stats.lastFailureTime).not.toBeNull();
  });

  // ── CLOSED → OPEN 전이 ────────────────────────────────────────────────────────

  it('execute: 5회 연속 실패 시 OPEN 상태로 전이된다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    expect(service.getStats().state).toBe(CircuitBreakerState.OPEN);
    expect(service.isOpen()).toBe(true);
  });

  // ── OPEN 상태에서 요청 차단 ───────────────────────────────────────────────────

  it('execute: OPEN 상태에서 fallback 없이 호출하면 에러를 throw한다', async () => {
    // OPEN으로 전이
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    await expect(
      service.execute(async () => 'ok'),
    ).rejects.toThrow('Circuit Breaker is OPEN');
  });

  it('execute: OPEN 상태에서 fallback이 있으면 fallback을 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    const result = await service.execute(async () => 'ok', 'fallback');
    expect(result).toBe('fallback');
  });

  // ── 실패 임계값 도달 시 fallback ──────────────────────────────────────────────

  it('execute: 실패 후 임계값 도달 시 fallback 데이터를 반환한다', async () => {
    // 4번 실패 (임계값-1)
    for (let i = 0; i < 4; i++) {
      await service.execute(async () => { throw new Error('fail'); }, []).catch(() => {});
    }

    // 5번째 실패 — 임계값 도달, fallback 반환
    const result = await service.execute(
      async () => { throw new Error('fail'); },
      'fallback-data',
    );
    expect(result).toBe('fallback-data');
  });

  // ── 성공 시 failureCount 리셋 ─────────────────────────────────────────────────

  it('execute: 성공하면 failureCount가 0으로 리셋된다', async () => {
    // 3번 실패
    for (let i = 0; i < 3; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }
    expect(service.getStats().failureCount).toBe(3);

    // 1번 성공
    await service.execute(async () => 'ok');
    expect(service.getStats().failureCount).toBe(0);
  });

  // ── HALF_OPEN → CLOSED 복구 ───────────────────────────────────────────────────

  it('execute: HALF_OPEN 상태에서 성공하면 CLOSED로 복구된다', async () => {
    // OPEN으로 전이
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }
    expect(service.getStats().state).toBe(CircuitBreakerState.OPEN);

    // recoveryTimeout 경과 시뮬레이션
    jest.useFakeTimers();
    jest.advanceTimersByTime(30001);

    const result = await service.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(service.getStats().state).toBe(CircuitBreakerState.CLOSED);

    jest.useRealTimers();
  });

  // ── HALF_OPEN에서 다시 실패 → OPEN ────────────────────────────────────────────

  it('execute: HALF_OPEN 상태에서 실패하면 다시 OPEN으로 전이된다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    jest.useFakeTimers();
    jest.advanceTimersByTime(30001);

    await service.execute(async () => { throw new Error('fail again'); }).catch(() => {});
    expect(service.getStats().state).toBe(CircuitBreakerState.OPEN);

    jest.useRealTimers();
  });

  // ── reset ─────────────────────────────────────────────────────────────────────

  it('reset: 모든 상태를 초기값으로 리셋한다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    service.reset();

    const stats = service.getStats();
    expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    expect(stats.failureCount).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });

  // ── isOpen / canExecute ───────────────────────────────────────────────────────

  it('isOpen: CLOSED 상태에서 false를 반환한다', () => {
    expect(service.isOpen()).toBe(false);
  });

  it('canExecute: CLOSED 상태에서 true를 반환한다', () => {
    expect(service.canExecute()).toBe(true);
  });

  it('canExecute: OPEN 상태 + recoveryTimeout 미경과 시 false를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }
    expect(service.canExecute()).toBe(false);
  });

  it('canExecute: OPEN 상태 + recoveryTimeout 경과 시 true를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await service.execute(async () => { throw new Error('fail'); }).catch(() => {});
    }

    jest.useFakeTimers();
    jest.advanceTimersByTime(30001);
    expect(service.canExecute()).toBe(true);
    jest.useRealTimers();
  });
});
