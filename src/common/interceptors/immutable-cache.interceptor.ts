import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, type Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { CachedOpenF1ClientService } from '../services/cached-openf1-client.service';

/**
 * HTTP immutable 캐시 (plan.md 2단계 — Redis 대신 채택).
 *
 * 끝난 세션의 응답은 불변이므로 브라우저/CDN가 직접 캐시하게 만든다.
 * → 리플레이 재시청·스크럽 시 요청이 서버에 아예 도달하지 않음(가장 큰 레버리지).
 *
 * 핵심:
 *  - 끝난 세션(date_end < now)일 때만 `Cache-Control: public, max-age, immutable` + 결정적 ETag.
 *  - 미확정/진행 중 세션은 `no-store`(불변 보장 불가 → 캐시 금지).
 *  - ETag 에 logic_version 을 포함 → 계산 로직이 바뀌면(버전 +1) ETag 가 달라져 revalidation 시 최신본 전달.
 *  - 본문 기반 해시가 아니라 (URL + version) 기반 결정적 ETag → 수 MB 응답을 매번 해싱하지 않음.
 *    Express 의 조건부 GET(If-None-Match)이 이 ETag 로 304 를 자동 처리(대역폭 절약).
 */
export interface ImmutableCacheOptions {
  /** ETag 가독성을 위한 짧은 접두사(예: 'driver-timings'). 고유성은 URL 로 보장. */
  tag: string;
  /** 가공 결과의 logic_version. 버전이 바뀌면 ETag 가 달라져 캐시가 자연 무효화된다. */
  version?: number;
  /** 캐시 수명(초). 미지정 시 기본값(1일). 원본처럼 영구 불변이면 길게(예: 1년). */
  maxAge?: number;
}

export const IMMUTABLE_CACHE_KEY = 'immutable_cache_options';

/** 끝난 세션 응답을 브라우저/CDN가 캐시하도록 표시(엔드포인트 핸들러에 부착). */
export const ImmutableCache = (
  options: ImmutableCacheOptions,
): MethodDecorator => SetMetadata(IMMUTABLE_CACHE_KEY, options);

/** 기본 캐시 수명: 1일. 가공 결과는 deploy 의 logic 변경이 하루 내 전파되도록 보수적으로. */
export const DEFAULT_IMMUTABLE_MAX_AGE = 86_400;
/** 원본처럼 영구 불변인 데이터용: 1년. */
export const RAW_IMMUTABLE_MAX_AGE = 31_536_000;

@Injectable()
export class ImmutableCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cachedClient: CachedOpenF1ClientService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<ImmutableCacheOptions | undefined>(
      IMMUTABLE_CACHE_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const sessionKey = Number(req.params?.sessionKey);
    if (!Number.isFinite(sessionKey)) return next.handle();

    // 핸들러를 먼저 실행(에러 시 캐시 헤더를 붙이지 않음) → 끝난 세션이면 캐시 허용.
    return next.handle().pipe(
      mergeMap((data: unknown) =>
        from(this.cachedClient.isSessionFinal(sessionKey)).pipe(
          map((isFinal): unknown => {
            if (isFinal) {
              res.setHeader('ETag', this.buildEtag(options, req));
              res.setHeader('Cache-Control', this.buildCacheControl(options));
            } else {
              // 진행 중/미확정 세션은 불변이 아니므로 캐시 금지.
              res.setHeader('Cache-Control', 'no-store');
            }
            return data;
          }),
        ),
      ),
    );
  }

  private buildEtag(options: ImmutableCacheOptions, req: Request): string {
    // (URL + logic_version) 으로 결정적 ETag. URL 이 sessionKey·쿼리(예: laps 의 lapNumber)를 포함해 고유.
    // weak ETag: 바이트 일치가 아니라 의미 동등성(같은 입력 = 같은 불변 응답)을 표현.
    const url = req.originalUrl ?? req.url ?? '';
    return `W/"${options.tag}-v${options.version ?? 0}-${url}"`;
  }

  private buildCacheControl(options: ImmutableCacheOptions): string {
    const maxAge = options.maxAge ?? DEFAULT_IMMUTABLE_MAX_AGE;
    return `public, max-age=${maxAge}, immutable`;
  }
}
