import { Injectable } from '@nestjs/common';
import { PositionPipelineService } from './position-pipeline.service';
import { PositionsResponse } from './interfaces/positions.interface';

/**
 * positions 캐시 래퍼 (plan.md §7.3).
 *
 * positions 결과는 무겁고 불변 → 인메모리 Map 캐시 + single-flight(동시요청 1회만 빌드).
 * 캐시 키에 LOGIC_VERSION 포함 → 파이프라인 로직 변경 시 자연 무효화.
 * (plan.md RDB+Redis 도입 시 이 레이어를 그 폴백 캐시로 치환, jsonb 영구저장.)
 */
@Injectable()
export class PositionsService {
  // 파이프라인 로직 변경 시 올려 캐시 무효화
  private static readonly LOGIC_VERSION = 1;

  private readonly cache = new Map<string, PositionsResponse>();
  private readonly inflight = new Map<string, Promise<PositionsResponse>>();

  constructor(private readonly pipeline: PositionPipelineService) {}

  async getPositions(sessionKey: number): Promise<PositionsResponse> {
    const key = `positions:${sessionKey}:v${PositionsService.LOGIC_VERSION}`;

    const cached = this.cache.get(key);
    if (cached) return cached;

    const flying = this.inflight.get(key);
    if (flying) return flying;

    const promise = this.pipeline
      .build(sessionKey)
      .then((res) => {
        this.cache.set(key, res);
        this.inflight.delete(key);
        return res;
      })
      .catch((err) => {
        this.inflight.delete(key); // 실패는 캐시하지 않음(재시도 허용)
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }
}
