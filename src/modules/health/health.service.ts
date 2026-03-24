import { Injectable } from '@nestjs/common';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from '../../common/services/circuit-breaker.service';
import type {
  HealthStatus,
  HealthStatusValue,
  CircuitBreakerStatsWithHealth,
  ResetResponse,
} from './interfaces/health.interface';

const HEALTH_STATUS_MAP: Record<CircuitBreakerState, HealthStatusValue> = {
  [CircuitBreakerState.CLOSED]: 'healthy',
  [CircuitBreakerState.HALF_OPEN]: 'recovering',
  [CircuitBreakerState.OPEN]: 'unhealthy',
};

@Injectable()
export class HealthService {
  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  getHealthStatus(): HealthStatus {
    const circuitBreakerStats = this.circuitBreaker.getStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        openf1Api: {
          circuitBreaker: circuitBreakerStats,
          healthy: circuitBreakerStats.state !== CircuitBreakerState.OPEN,
        },
      },
    };
  }

  getCircuitBreakerStats(): CircuitBreakerStatsWithHealth {
    const stats = this.circuitBreaker.getStats();

    return {
      ...stats,
      healthStatus: HEALTH_STATUS_MAP[stats.state] ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  resetCircuitBreaker(): ResetResponse {
    this.circuitBreaker.reset();

    return {
      message: 'Circuit Breaker has been reset',
      timestamp: new Date().toISOString(),
      newStats: this.circuitBreaker.getStats(),
    };
  }
}
