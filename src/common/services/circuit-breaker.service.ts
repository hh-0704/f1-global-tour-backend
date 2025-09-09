import { Injectable, Logger } from '@nestjs/common';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // 정상 동작
  OPEN = 'OPEN',         // 차단 상태 (요청 차단)
  HALF_OPEN = 'HALF_OPEN' // 반개방 상태 (테스트 요청)
}

export interface CircuitBreakerOptions {
  failureThreshold: number;    // 실패 임계값 (기본: 5회)
  recoveryTimeout: number;     // 복구 시도 시간 (기본: 30초)
  monitoringPeriod: number;    // 모니터링 주기 (기본: 10초)
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number | null;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  
  private readonly options: CircuitBreakerOptions = {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30초
    monitoringPeriod: 10000  // 10초
  };

  constructor() {
    this.logger.log(`Circuit Breaker initialized with options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Circuit Breaker를 통해 작업 실행
   * @param operation - 실행할 비동기 작업
   * @param fallbackData - 차단 시 반환할 대체 데이터
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallbackData?: T
  ): Promise<T> {
    this.totalRequests++;

    // OPEN 상태: 요청 차단
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.logger.log('Circuit Breaker: Transitioning to HALF_OPEN state');
      } else {
        this.logger.warn('Circuit Breaker: Request blocked (OPEN state)');
        if (fallbackData !== undefined) {
          return fallbackData;
        }
        throw new Error('Circuit Breaker is OPEN - Service temporarily unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      
      // fallback 데이터가 있고 실패 임계값에 도달했으면 반환
      if (fallbackData !== undefined && this.failureCount >= this.options.failureThreshold) {
        this.logger.warn('Circuit Breaker: Returning fallback data due to excessive failures');
        return fallbackData;
      }
      
      throw error;
    }
  }

  /**
   * 작업 성공 시 호출
   */
  private onSuccess(): void {
    this.successfulRequests++;
    this.failureCount = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.logger.log('Circuit Breaker: Recovered to CLOSED state');
    }
  }

  /**
   * 작업 실패 시 호출
   */
  private onFailure(error: any): void {
    this.failedRequests++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    this.logger.error(`Circuit Breaker: Request failed (${this.failureCount}/${this.options.failureThreshold})`, error.message);
    
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.logger.error('Circuit Breaker: Opened due to excessive failures');
    }
  }

  /**
   * 복구 시도 여부 결정
   */
  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) return false;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.options.recoveryTimeout;
  }

  /**
   * Circuit Breaker 통계 조회
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests
    };
  }

  /**
   * Circuit Breaker 수동 리셋
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    
    this.logger.log('Circuit Breaker: Manually reset to CLOSED state');
  }

  /**
   * 현재 상태 확인
   */
  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  /**
   * 요청 가능 여부 확인
   */
  canExecute(): boolean {
    return this.state !== CircuitBreakerState.OPEN || this.shouldAttemptRecovery();
  }
}