import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import {
  ImmutableCacheInterceptor,
  ImmutableCacheOptions,
} from './immutable-cache.interceptor';
import { CachedOpenF1ClientService } from '../services/cached-openf1-client.service';

const DATA = { hello: 'world' };

describe('ImmutableCacheInterceptor', () => {
  let reflector: { get: jest.Mock };
  let cachedClient: { isSessionFinal: jest.Mock };
  let interceptor: ImmutableCacheInterceptor;
  let setHeader: jest.Mock;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    cachedClient = { isSessionFinal: jest.fn() };
    setHeader = jest.fn();
    interceptor = new ImmutableCacheInterceptor(
      reflector as unknown as Reflector,
      cachedClient as unknown as CachedOpenF1ClientService,
    );
  });

  function makeContext(req: Record<string, unknown>): {
    context: ExecutionContext;
    next: CallHandler;
  } {
    const res = { setHeader };
    const context = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(DATA) };
    return { context, next };
  }

  it('@ImmutableCache 메타데이터가 없으면 패스스루하고 헤더를 건드리지 않는다', async () => {
    reflector.get.mockReturnValue(undefined);
    const { context, next } = makeContext({
      params: { sessionKey: '100' },
      originalUrl: '/api/v1/sessions/100/positions',
      headers: {},
    });

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(DATA);
    expect(setHeader).not.toHaveBeenCalled();
    expect(cachedClient.isSessionFinal).not.toHaveBeenCalled();
  });

  it('끝난 세션이면 immutable Cache-Control 과 결정적 ETag 를 설정한다', async () => {
    const opts: ImmutableCacheOptions = {
      tag: 'positions',
      version: 3,
    };
    reflector.get.mockReturnValue(opts);
    cachedClient.isSessionFinal.mockResolvedValue(true);
    const { context, next } = makeContext({
      params: { sessionKey: '9472' },
      originalUrl: '/api/v1/sessions/9472/positions',
      headers: {},
    });

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(DATA);
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=86400, immutable',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'ETag',
      'W/"positions-v3-/api/v1/sessions/9472/positions"',
    );
  });

  it('미확정(진행 중) 세션이면 no-store 로 캐시를 금지한다', async () => {
    reflector.get.mockReturnValue({ tag: 'driver-timings', version: 1 });
    cachedClient.isSessionFinal.mockResolvedValue(false);
    const { context, next } = makeContext({
      params: { sessionKey: '500' },
      originalUrl: '/api/v1/sessions/500/driver-timings',
      headers: {},
    });

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(DATA);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).not.toHaveBeenCalledWith('ETag', expect.anything());
  });

  it('maxAge 를 지정하면 그대로 반영한다(원본=1년)', async () => {
    reflector.get.mockReturnValue({ tag: 'laps', maxAge: 31_536_000 });
    cachedClient.isSessionFinal.mockResolvedValue(true);
    const { context, next } = makeContext({
      params: { sessionKey: '7', driverNumber: undefined },
      originalUrl: '/api/v1/laps/session/7?lapNumber=3',
      headers: {},
    });

    await lastValueFrom(interceptor.intercept(context, next));

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    // ETag 가 쿼리(lapNumber)까지 반영해 고유.
    expect(setHeader).toHaveBeenCalledWith(
      'ETag',
      'W/"laps-v0-/api/v1/laps/session/7?lapNumber=3"',
    );
  });

  it('sessionKey 가 없으면(목록 등) 패스스루한다', async () => {
    reflector.get.mockReturnValue({ tag: 'whatever' });
    const { context, next } = makeContext({
      params: {},
      originalUrl: '/api/v1/sessions',
      headers: {},
    });

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(DATA);
    expect(setHeader).not.toHaveBeenCalled();
    expect(cachedClient.isSessionFinal).not.toHaveBeenCalled();
  });
});
