import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError, Observable } from 'rxjs';
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

function mockAxiosObservable<T>(data: T): Observable<AxiosResponse<T>> {
  return of(mockAxiosResponse(data));
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
    httpService.get.mockReturnValue(mockAxiosObservable(sessions));

    const result = await service.fetchSessions({ country_name: 'Japan' });

    expect(result).toEqual(sessions);
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/sessions?country_name=Japan'),
    );
  });

  it('fetchSessions: 파라미터 없이 호출 가능하다', async () => {
    httpService.get.mockReturnValue(mockAxiosObservable([]));

    const result = await service.fetchSessions();

    expect(result).toEqual([]);
  });

  // ── fetchDrivers ──────────────────────────────────────────────────────────────

  it('fetchDrivers: 드라이버 목록을 반환한다', async () => {
    const drivers = [{ driver_number: 1, name_acronym: 'VER' }];
    httpService.get.mockReturnValue(mockAxiosObservable(drivers));

    const result = await service.fetchDrivers({ session_key: 9472 });

    expect(result).toEqual(drivers);
  });

  // ── fetchLaps ─────────────────────────────────────────────────────────────────

  it('fetchLaps: 랩 데이터를 반환한다', async () => {
    const laps = [{ lap_number: 1 }];
    httpService.get.mockReturnValue(mockAxiosObservable(laps));

    const result = await service.fetchLaps({ session_key: 9472 });

    expect(result).toEqual(laps);
  });

  // ── fetchCarData ──────────────────────────────────────────────────────────────

  it('fetchCarData: car_data를 반환한다', async () => {
    const carData = [{ speed: 300 }];
    httpService.get.mockReturnValue(mockAxiosObservable(carData));

    const result = await service.fetchCarData({
      session_key: 9472,
      driver_number: 1,
    });

    expect(result).toEqual(carData);
  });

  // ── fetchIntervals ────────────────────────────────────────────────────────────

  it('fetchIntervals: interval 데이터를 반환한다', async () => {
    const intervals = [{ gap_to_leader: 0 }];
    httpService.get.mockReturnValue(mockAxiosObservable(intervals));

    const result = await service.fetchIntervals({ session_key: 9472 });

    expect(result).toEqual(intervals);
  });

  // ── fetchRaceControl ──────────────────────────────────────────────────────────

  it('fetchRaceControl: race_control 메시지를 반환한다', async () => {
    const messages = [{ category: 'Flag', message: 'GREEN FLAG' }];
    httpService.get.mockReturnValue(mockAxiosObservable(messages));

    const result = await service.fetchRaceControl({ session_key: 9472 });

    expect(result).toEqual(messages);
  });

  // ── fetchStints ───────────────────────────────────────────────────────────────

  it('fetchStints: stint 데이터를 반환한다', async () => {
    const stints = [{ compound: 'SOFT' }];
    httpService.get.mockReturnValue(mockAxiosObservable(stints));

    const result = await service.fetchStints({ session_key: 9472 });

    expect(result).toEqual(stints);
  });

  // ── fetchLocation ─────────────────────────────────────────────────────────────

  it('fetchLocation: location 데이터를 반환한다', async () => {
    const loc = [{ driver_number: 1, x: 100, y: 200, z: 0, date: 'd' }];
    httpService.get.mockReturnValue(mockAxiosObservable(loc));

    const result = await service.fetchLocation({
      session_key: 9472,
      driver_number: 1,
    });

    expect(result).toEqual(loc);
    const calledUrl = httpService.get.mock.calls[0][0];
    expect(calledUrl).toContain('/location?');
    expect(calledUrl).toContain('session_key=9472');
    expect(calledUrl).toContain('driver_number=1');
  });

  it('fetchLocation: date 연산자는 인코딩 없이, 값만 인코딩해 조립한다', async () => {
    httpService.get.mockReturnValue(mockAxiosObservable([]));

    await service.fetchLocation({
      session_key: 9472,
      driver_number: 1,
      dateGt: '2023-09-16T13:00:00Z',
      dateLt: '2023-09-16T13:10:00Z',
    });

    const calledUrl = httpService.get.mock.calls[0][0];
    // 연산자(>=, <=)는 원문 유지, 값의 ':' 는 %3A 로 인코딩
    expect(calledUrl).toContain('date>=2023-09-16T13%3A00%3A00Z');
    expect(calledUrl).toContain('date<=2023-09-16T13%3A10%3A00Z');
    expect(calledUrl).not.toContain('date%3E'); // 연산자가 인코딩되면 안 됨
  });

  // ── fetchLocationWindow ───────────────────────────────────────────────────────

  it('fetchLocationWindow: 윈도우가 없으면 단일 요청', async () => {
    const loc = [{ date: 'a', x: 1, y: 2 }];
    httpService.get.mockReturnValue(mockAxiosObservable(loc));

    const result = await service.fetchLocationWindow(9472, 1);

    expect(result).toEqual(loc);
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('fetchLocationWindow: 큰 윈도우는 청크로 나눠 순차 요청 후 dedupe·정렬', async () => {
    // 60분 윈도우 / 20분 청크 → 경계 [13:00,13:20,13:40,14:00] = 3청크
    httpService.get
      .mockReturnValueOnce(
        mockAxiosObservable([{ date: '2023-09-16T13:30:00Z' }]),
      )
      .mockReturnValueOnce(
        mockAxiosObservable([
          { date: '2023-09-16T13:10:00Z' },
          { date: '2023-09-16T13:30:00Z' }, // 1청크와 중복 → dedupe
        ]),
      )
      .mockReturnValueOnce(
        mockAxiosObservable([{ date: '2023-09-16T13:50:00Z' }]),
      );

    const result = await service.fetchLocationWindow(
      9472,
      1,
      '2023-09-16T13:00:00Z',
      '2023-09-16T14:00:00Z',
      20,
    );

    expect(httpService.get).toHaveBeenCalledTimes(3);
    // 중복 13:30 은 1건, 시간순 정렬
    expect(result.map((r) => r.date)).toEqual([
      '2023-09-16T13:10:00Z',
      '2023-09-16T13:30:00Z',
      '2023-09-16T13:50:00Z',
    ]);
  });

  // ── 429 재시도 ────────────────────────────────────────────────────────────────

  it('fetchDrivers: 429 응답 시 재시도 후 성공한다', async () => {
    const drivers = [{ driver_number: 1 }];
    httpService.get
      .mockReturnValueOnce(throwError(() => mock429Error()))
      .mockReturnValueOnce(mockAxiosObservable(drivers));

    const result = await service.fetchDrivers({ session_key: 9472 });

    expect(result).toEqual(drivers);
    expect(httpService.get).toHaveBeenCalledTimes(2);
  }, 10000);

  // ── 서킷 브레이커 연동 ────────────────────────────────────────────────────────

  it('fetchSessions: 서킷 브레이커 OPEN 시 빈 배열(fallback)을 반환한다', async () => {
    // 서킷 브레이커를 OPEN으로 전이
    httpService.get.mockReturnValue(throwError(() => new Error('fail')));
    for (let i = 0; i < 5; i++) {
      await service.fetchSessions().catch(() => {});
    }
    expect(circuitBreaker.isOpen()).toBe(true);

    const result = await service.fetchSessions();
    expect(result).toEqual([]);
  });

  // ── buildUrl ──────────────────────────────────────────────────────────────────

  it('fetchLaps: 쿼리 파라미터가 URL에 포함된다', async () => {
    httpService.get.mockReturnValue(mockAxiosObservable([]));

    await service.fetchLaps({ session_key: 9472, lap_number: 3 });

    const calledUrl = httpService.get.mock.calls[0][0];
    expect(calledUrl).toContain('session_key=9472');
    expect(calledUrl).toContain('lap_number=3');
  });

  it('fetchLaps: undefined/null 파라미터는 URL에서 제외된다', async () => {
    httpService.get.mockReturnValue(mockAxiosObservable([]));

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
    httpService.get.mockReturnValue(throwError(() => new Error('fail')));
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
    httpService.get.mockReturnValue(throwError(() => axiosError));

    // 서킷 브레이커가 아직 CLOSED이므로 첫 호출에서 바로 에러
    await expect(service.fetchSessions()).rejects.toThrow(HttpException);
  });
});
