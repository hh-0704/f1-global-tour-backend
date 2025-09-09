import { CircuitBreakerStats } from '../../../common/services/circuit-breaker.service';

export interface HealthStatus {
  status: string;
  timestamp: string;
  services: {
    openf1Api: {
      circuitBreaker: CircuitBreakerStats;
      healthy: boolean;
    };
  };
}

export interface CircuitBreakerStatsWithHealth extends CircuitBreakerStats {
  healthStatus: string;
  timestamp: string;
}

export interface ResetResponse {
  message: string;
  timestamp: string;
  newStats: CircuitBreakerStats;
}