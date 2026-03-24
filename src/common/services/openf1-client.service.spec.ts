/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { HttpException } from '@nestjs/common';
import { OpenF1ClientService } from './openf1-client.service';
import { CircuitBreakerService } from './circuit-breaker.service';

const BASE_URL = 'https://api.openf1.org/v1';

function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
  };
}

function mock429Error(): AxiosError {
  const error = new AxiosError('Too Many Requests');
  error.response = {
    status: 429,
    statusText: 'Too Many Requests',
    data: {},
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
  };
  return error;
}

describe('OpenF1ClientService', () => {
  let service: OpenF1ClientService;
  let httpService: jest.Mocked<HttpService>;
  let circuitBreaker: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenF1ClientService,
        CircuitBreakerService,
        {
          provide: HttpService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(BASE_URL),
          },
        },
      ],
    }).compile();

    service = module.get<OpenF1ClientService>(OpenF1ClientService);
    httpService = module.get(HttpService);
    circuitBreaker = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  // ── fetchSessions ─────────────────────────────────────────────────────────────

  it('fetchSessions: 세션 목록을 반환한다', async () => {
    const sessions = [{ session_key: 9472 }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(sessions)) as any);

    const result = await service.fetchSessions({ country_name: 'Japan' });

    expect(result).toEqual(sessions);
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/sessions?country_name=Japan'),
    );
  });

  it('fetchSessions: 파라미터 없이 호출 가능하다', async () => {
    httpService.get.mockReturnValue(of(mockAxiosResponse([])) as any);

    const result = await service.fetchSessions();

    expect(result).toEqual([]);
  });

  // ── fetchDrivers ──────────────────────────────────────────────────────────────

  it('fetchDrivers: 드라이버 목록을 반환한다', async () => {
    const drivers = [{ driver_number: 1, name_acronym: 'VER' }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(drivers)) as any);

    const result = await service.fetchDrivers({ session_key: 9472 });

    expect(result).toEqual(drivers);
  });

  // ── fetchLaps ─────────────────────────────────────────────────────────────────

  it('fetchLaps: 랩 데이터를 반환한다', async () => {
    const laps = [{ lap_number: 1 }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(laps)) as any);

    const result = await service.fetchLaps({ session_key: 9472 });

    expect(result).toEqual(laps);
  });

  // ── fetchCarData ──────────────────────────────────────────────────────────────

  it('fetchCarData: car_data를 반환한다', async () => {
    const carData = [{ speed: 300 }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(carData)) as any);

    const result = await service.fetchCarData({ session_key: 9472, driver_number: 1 });

    expect(result).toEqual(carData);
  });

  // ── fetchIntervals ────────────────────────────────────────────────────────────

  it('fetchIntervals: interval 데이터를 반환한다', async () => {
    const intervals = [{ gap_to_leader: 0 }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(intervals)) as any);

    const result = await service.fetchIntervals({ session_key: 9472 });

    expect(result).toEqual(intervals);
  });

  // ── fetchRaceControl ──────────────────────────────────────────────────────────

  it('fetchRaceControl: race_control 메시지를 반환한다', async () => {
    const messages = [{ category: 'Flag', message: 'GREEN FLAG' }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(messages)) as any);

    const result = await service.fetchRaceControl({ session_key: 9472 });

    expect(result).toEqual(messages);
  });

  // ── fetchStints ───────────────────────────────────────────────────────────────

  it('fetchStints: stint 데이터를 반환한다', async () => {
    const stints = [{ compound: 'SOFT' }];
    httpService.get.mockReturnValue(of(mockAxiosResponse(stints)) as any);

    const result = await service.fetchStints({ session_key: 9472 });

    expect(result).toEqual(stints);
  });

  // ── 429 재시도 ────────────────────────────────────────────────────────────────

  it('fetchDrivers: 429 응답 시 재시도 후 성공한다', async () => {
    const drivers = [{ driver_number: 1 }];
    httpService.get
      .mockReturnValueOnce(throwError(() => mock429Error()) as any)
      .mockReturnValueOnce(of(mockAxiosResponse(drivers)) as any);

    const result = await service.fetchDrivers({ session_key: 9472 });

    expect(result).toEqual(drivers);
    expect(httpService.get).toHaveBeenCalledTimes(2);
  }, 10000);

  // ── 서킷 브레이커 연동 ────────────────────────────────────────────────────────

  it('fetchSessions: 서킷 브레이커 OPEN 시 빈 배열(fallback)을 반환한다', async () => {
    // 서킷 브레이커를 OPEN으로 전이
    httpService.get.mockReturnValue(throwError(() => new Error('fail')) as any);
    for (let i = 0; i < 5; i++) {
      await service.fetchSessions().catch(() => {});
    }
    expect(circuitBreaker.isOpen()).toBe(true);

    const result = await service.fetchSessions();
    expect(result).toEqual([]);
  });

  // ── buildUrl ──────────────────────────────────────────────────────────────────

  it('fetchLaps: 쿼리 파라미터가 URL에 포함된다', async () => {
    httpService.get.mockReturnValue(of(mockAxiosResponse([])) as any);

    await service.fetchLaps({ session_key: 9472, lap_number: 3 });

    const calledUrl = httpService.get.mock.calls[0][0];
    expect(calledUrl).toContain('session_key=9472');
    expect(calledUrl).toContain('lap_number=3');
  });

  it('fetchLaps: undefined/null 파라미터는 URL에서 제외된다', async () => {
    httpService.get.mockReturnValue(of(mockAxiosResponse([])) as any);

    await service.fetchLaps({ session_key: 9472, lap_number: undefined });

    const calledUrl = httpService.get.mock.calls[0][0];
    expect(calledUrl).toContain('session_key=9472');
    expect(calledUrl).not.toContain('lap_number');
  });

  // ── getCircuitBreakerStats / resetCircuitBreaker ──────────────────────────────

  it('getCircuitBreakerStats: 서킷 브레이커 통계를 반환한다', () => {
    const stats = service.getCircuitBreakerStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.totalRequests).toBe(0);
  });

  it('resetCircuitBreaker: 서킷 브레이커를 리셋한다', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('fail')) as any);
    for (let i = 0; i < 5; i++) {
      await service.fetchSessions().catch(() => {});
    }
    expect(circuitBreaker.isOpen()).toBe(true);

    service.resetCircuitBreaker();
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  // ── API 에러 시 HttpException ─────────────────────────────────────────────────

  it('fetchSessions: API 에러 시 HttpException(SERVICE_UNAVAILABLE)을 throw한다', async () => {
    const axiosError = new AxiosError('Network Error');
    httpService.get.mockReturnValue(throwError(() => axiosError) as any);

    // 서킷 브레이커가 아직 CLOSED이므로 첫 호출에서 바로 에러
    await expect(service.fetchSessions()).rejects.toThrow(HttpException);
  });
});
