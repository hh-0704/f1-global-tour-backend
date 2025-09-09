import { Controller, Get, Post } from '@nestjs/common';
import { HealthService } from './health.service';
import type { HealthStatus, CircuitBreakerStatsWithHealth, ResetResponse } from './interfaces/health.interface';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getHealthStatus();
  }

  @Get('circuit-breaker')
  getCircuitBreakerStats(): CircuitBreakerStatsWithHealth {
    return this.healthService.getCircuitBreakerStats();
  }

  @Post('circuit-breaker/reset')
  resetCircuitBreaker(): ResetResponse {
    return this.healthService.resetCircuitBreaker();
  }
}