import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PositionPipelineService } from './position-pipeline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { POSITIONS_LOGIC_VERSION } from '../../common/constants/logic-version';
import { PositionsResponse } from './interfaces/positions.interface';

/**
 * positions 캐시 래퍼 (plan.md §6.6).
 *
 * positions 결과는 무겁고 불변 → positions_cache(jsonb) 영구 캐시 + logic_version 무효화.
 * 빌드는 드라이버별 /location 순차 수집이라 매우 무거우므로, DB miss 시 single-flight 로
 * 동시 요청이 같은 빌드에 합류하게 한다. 끝난 세션·의미있는 결과만 저장.
 * (2단계 Redis 도입 시 RDB 앞단에 핫캐시로 얹는다.)
 */
@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);
  private readonly inflight = new Map<number, Promise<PositionsResponse>>();

  constructor(
    private readonly pipeline: PositionPipelineService,
    private readonly prisma: PrismaService,
    private readonly cachedClient: CachedOpenF1ClientService,
  ) {}

  async getPositions(sessionKey: number): Promise<PositionsResponse> {
    // 1. RDB 캐시 조회 (logic_version 일치 시 hit)
    try {
      const row = await this.prisma.positionsCache.findUnique({
        where: { sessionKey },
      });
      if (row && row.logicVersion === POSITIONS_LOGIC_VERSION) {
        return row.result as unknown as PositionsResponse;
      }
    } catch (e) {
      this.logger.warn(
        `positions 캐시 조회 실패(session=${sessionKey}): ${this.errMsg(e)}`,
      );
    }

    // 2. single-flight: 동시 요청은 동일 빌드에 합류 (positions 빌드는 무거움)
    const flying = this.inflight.get(sessionKey);
    if (flying) return flying;

    const promise = this.buildAndPersist(sessionKey).finally(() =>
      this.inflight.delete(sessionKey),
    );
    this.inflight.set(sessionKey, promise);
    return promise;
  }

  private async buildAndPersist(
    sessionKey: number,
  ): Promise<PositionsResponse> {
    const res = await this.pipeline.build(sessionKey);

    // 의미있는 결과(드라이버 존재) + 끝난 세션만 영구 저장
    if (
      Object.keys(res.drivers).length > 0 &&
      (await this.cachedClient.isSessionFinal(sessionKey))
    ) {
      try {
        const result = res as unknown as Prisma.InputJsonValue;
        await this.prisma.positionsCache.upsert({
          where: { sessionKey },
          create: { sessionKey, result, logicVersion: POSITIONS_LOGIC_VERSION },
          update: {
            result,
            logicVersion: POSITIONS_LOGIC_VERSION,
            computedAt: new Date(),
          },
        });
      } catch (e) {
        this.logger.warn(
          `positions 캐시 저장 실패(session=${sessionKey}): ${this.errMsg(e)}`,
        );
      }
    }
    return res;
  }

  private errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
