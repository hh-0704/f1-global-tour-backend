import { CircuitBreakerStats } from '../../../common/services/circuit-breaker.service';

export type HealthStatusValue = 'healthy' | 'recovering' | 'unhealthy' | 'unknown';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  services: {
    openf1Api: {
      circuitBreaker: CircuitBreakerStats;
      healthy: boolean;
    };
  };
}

export interface CircuitBreakerStatsWithHealth extends CircuitBreakerStats {
  healthStatus: HealthStatusValue;
  timestamp: string;
}

export interface ResetResponse {
  message: string;
  timestamp: string;
  newStats: CircuitBreakerStats;
}
