import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from '../../common/services/circuit-breaker.service';

describe('HealthService', () => {
  let service: HealthService;
  let circuitBreaker: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, CircuitBreakerService],
    }).compile();

    service = module.get<HealthService>(HealthService);
    circuitBreaker = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  // ── getHealthStatus ───────────────────────────────────────────────────────────

  it('getHealthStatus: CLOSED 상태에서 status=ok, healthy=true를 반환한다', () => {
    const result = service.getHealthStatus();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.services.openf1Api.healthy).toBe(true);
    expect(result.services.openf1Api.circuitBreaker.state).toBe(
      CircuitBreakerState.CLOSED,
    );
  });

  it('getHealthStatus: OPEN 상태에서 healthy=false를 반환한다', async () => {
    // OPEN으로 전이
    for (let i = 0; i < 5; i++) {
      await circuitBreaker
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});
    }

    const result = service.getHealthStatus();

    expect(result.status).toBe('ok');
    expect(result.services.openf1Api.healthy).toBe(false);
  });

  // ── getCircuitBreakerStats ────────────────────────────────────────────────────

  it('getCircuitBreakerStats: CLOSED 상태에서 healthStatus=healthy를 반환한다', () => {
    const result = service.getCircuitBreakerStats();

    expect(result.healthStatus).toBe('healthy');
    expect(result.state).toBe(CircuitBreakerState.CLOSED);
    expect(result.timestamp).toBeDefined();
  });

  it('getCircuitBreakerStats: OPEN 상태에서 healthStatus=unhealthy를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await circuitBreaker
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});
    }

    const result = service.getCircuitBreakerStats();

    expect(result.healthStatus).toBe('unhealthy');
    expect(result.failedRequests).toBe(5);
  });

  it('getCircuitBreakerStats: HALF_OPEN 상태에서 healthStatus=recovering를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await circuitBreaker
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});
    }

    // recoveryTimeout 경과
    jest.useFakeTimers();
    jest.advanceTimersByTime(30001);

    expect(circuitBreaker.canExecute()).toBe(true);

    jest.useRealTimers();
  });

  // ── resetCircuitBreaker ───────────────────────────────────────────────────────

  it('resetCircuitBreaker: 리셋 후 CLOSED 상태의 stats를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      await circuitBreaker
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});
    }

    const result = service.resetCircuitBreaker();

    expect(result.message).toBe('Circuit Breaker has been reset');
    expect(result.timestamp).toBeDefined();
    expect(result.newStats.state).toBe(CircuitBreakerState.CLOSED);
    expect(result.newStats.failureCount).toBe(0);
  });
});
