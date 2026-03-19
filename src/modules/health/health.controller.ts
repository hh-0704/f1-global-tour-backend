import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type {
  HealthStatus,
  CircuitBreakerStatsWithHealth,
  ResetResponse,
} from './interfaces/health.interface';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '앱 상태 확인', description: 'Circuit Breaker 상태를 포함한 전체 헬스체크' })
  @ApiResponse({ status: 200, description: '정상 동작 중' })
  getHealth(): HealthStatus {
    return this.healthService.getHealthStatus();
  }

  @Get('circuit-breaker')
  @ApiOperation({
    summary: 'Circuit Breaker 통계 조회',
    description: 'OpenF1 API Circuit Breaker 상태(CLOSED/OPEN/HALF_OPEN) 및 요청 통계 반환',
  })
  @ApiResponse({ status: 200, description: 'Circuit Breaker 통계' })
  getCircuitBreakerStats(): CircuitBreakerStatsWithHealth {
    return this.healthService.getCircuitBreakerStats();
  }

  @Post('circuit-breaker/reset')
  @ApiOperation({
    summary: 'Circuit Breaker 수동 리셋',
    description: 'OPEN 상태의 Circuit Breaker를 강제로 CLOSED로 초기화',
  })
  @ApiResponse({ status: 200, description: '리셋 완료' })
  resetCircuitBreaker(): ResetResponse {
    return this.healthService.resetCircuitBreaker();
  }
}
