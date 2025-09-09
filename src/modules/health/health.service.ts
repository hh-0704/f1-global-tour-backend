import { Injectable } from '@nestjs/common';
import { OpenF1ClientService } from '../../common/services/openf1-client.service';

@Injectable()
export class HealthService {
  constructor(private readonly openf1Client: OpenF1ClientService) {}

  getHealthStatus() {
    const circuitBreakerStats = this.openf1Client.getCircuitBreakerStats();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        openf1Api: {
          circuitBreaker: circuitBreakerStats,
          healthy: circuitBreakerStats.state !== 'OPEN'
        }
      }
    };
  }

  getCircuitBreakerStats() {
    const stats = this.openf1Client.getCircuitBreakerStats();
    
    return {
      ...stats,
      healthStatus: this.getHealthStatusFromStats(stats),
      timestamp: new Date().toISOString()
    };
  }

  resetCircuitBreaker() {
    this.openf1Client.resetCircuitBreaker();
    
    return {
      message: 'Circuit Breaker has been reset',
      timestamp: new Date().toISOString(),
      newStats: this.openf1Client.getCircuitBreakerStats()
    };
  }

  private getHealthStatusFromStats(stats: any): string {
    switch (stats.state) {
      case 'CLOSED':
        return 'healthy';
      case 'HALF_OPEN':
        return 'recovering';
      case 'OPEN':
        return 'unhealthy';
      default:
        return 'unknown';
    }
  }
}