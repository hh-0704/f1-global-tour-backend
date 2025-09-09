import { Controller, Get, Post } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getHealthStatus();
  }

  @Get('circuit-breaker')
  getCircuitBreakerStats() {
    return this.healthService.getCircuitBreakerStats();
  }

  @Post('circuit-breaker/reset')
  resetCircuitBreaker() {
    return this.healthService.resetCircuitBreaker();
  }
}