import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from './circuit-breaker.service';
import {
  OpenF1Session,
  OpenF1Driver,
  OpenF1Lap,
  OpenF1CarData,
  OpenF1Interval,
  OpenF1RaceControl,
  OpenF1Stint,
  OpenF1Location,
} from '../interfaces/openf1.interface';
import {
  SessionsQueryParams,
  DriversQueryParams,
  LapsQueryParams,
  CarDataQueryParams,
  IntervalsQueryParams,
  RaceControlQueryParams,
  StintsQueryParams,
  LocationQueryParams,
} from '../interfaces/query-params.interface';

@Injectable()
export class OpenF1ClientService {
  private readonly logger = new Logger(OpenF1ClientService.name);
  private readonly baseUrl: string;

  // /location 윈도우 청크 사이 최소 간격(ms) — rate limit 예방용
  private static readonly LOCATION_CHUNK_DELAY_MS = 400;

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 429 Rate Limit 시 재시도 (최대 3회, 지수 백오프)
  private async fetchWithRetry<T>(url: string, label: string): Promise<T> {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response$ = this.httpService.get<T>(url).pipe(
          catchError((error: AxiosError) => {
            throw error;
          }),
        );
        const response = await firstValueFrom(response$);
        return response.data;
      } catch (error) {
        const isRateLimit =
          error instanceof AxiosError && error.response?.status === 429;
        if (isRateLimit && attempt < MAX_RETRIES) {
          const delayMs = 2000 * (attempt + 1); // 2s → 4s → 6s
          this.logger.warn(
            `[${label}] 429 Rate Limit — ${delayMs}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
      }
    }
    throw new HttpException(
      'Max retries exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    const baseUrl = this.configService.get<string>('openf1.baseUrl');
    if (!baseUrl) {
      throw new Error(
        'OpenF1 API base URL is not configured. Please set OPENF1_API_BASE_URL environment variable.',
      );
    }
    this.baseUrl = baseUrl;
    this.logger.log(`OpenF1 Client initialized with base URL: ${this.baseUrl}`);
  }

  async fetchSessions(
    params: SessionsQueryParams = {},
  ): Promise<OpenF1Session[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/sessions', params);
        this.logger.debug(`Fetching sessions from: ${url}`);

        const response$ = this.httpService.get<OpenF1Session[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (sessions): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'OpenF1 API is unavailable',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} sessions`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchDrivers(params: DriversQueryParams): Promise<OpenF1Driver[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl('/drivers', params);
      this.logger.debug(`Fetching drivers from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1Driver[]>(url, 'drivers');
        this.logger.debug(`Retrieved ${data.length} drivers`);
        return data;
      } catch (error) {
        this.logger.error(
          `OpenF1 API Error (drivers): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch driver data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl('/laps', params);
      this.logger.debug(`Fetching laps from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1Lap[]>(url, 'laps');
        this.logger.debug(`Retrieved ${data.length} laps`);
        return data;
      } catch (error) {
        this.logger.error(
          `OpenF1 API Error (laps): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch lap data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl('/car_data', params);
      this.logger.debug(`Fetching car data from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1CarData[]>(
          url,
          'car_data',
        );
        this.logger.debug(`Retrieved ${data.length} car data points`);
        return data;
      } catch (error) {
        this.logger.error(
          `OpenF1 API Error (car_data): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch car telemetry data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  async fetchIntervals(
    params: IntervalsQueryParams,
  ): Promise<OpenF1Interval[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl('/intervals', params);
      this.logger.debug(`Fetching intervals from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1Interval[]>(
          url,
          'intervals',
        );
        this.logger.debug(`Retrieved ${data.length} interval points`);
        return data;
      } catch (error) {
        this.logger.error(
          `OpenF1 API Error (intervals): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch interval data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  async fetchRaceControl(
    params: RaceControlQueryParams,
  ): Promise<OpenF1RaceControl[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/race_control', params);
        this.logger.debug(`Fetching race control from: ${url}`);
        try {
          const data = await this.fetchWithRetry<OpenF1RaceControl[]>(
            url,
            'race_control',
          );
          this.logger.debug(`Retrieved ${data.length} race control messages`);
          return data;
        } catch {
          throw new HttpException(
            'Failed to fetch race control data',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
      },
      [], // Empty array as fallback
    );
  }

  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl('/stints', params);
      this.logger.debug(`Fetching stints from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1Stint[]>(url, 'stints');
        this.logger.debug(`Retrieved ${data.length} stints`);
        return data;
      } catch (error) {
        this.logger.error(
          `OpenF1 API Error (stints): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch stint data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  /**
   * /location 단일 요청 (한 드라이버, 선택적 date 윈도우).
   * date 연산자(date>=, date<=)는 URLSearchParams 가 인코딩하면 OpenF1 이 못 읽으므로 직접 조립.
   * 대량 윈도우는 fetchLocationWindow(청크 페이징)를 사용할 것.
   */
  async fetchLocation(params: LocationQueryParams): Promise<OpenF1Location[]> {
    return this.circuitBreaker.execute(async () => {
      const url = this.buildLocationUrl(params);
      this.logger.debug(`Fetching location from: ${url}`);
      try {
        const data = await this.fetchWithRetry<OpenF1Location[]>(
          url,
          'location',
        );
        this.logger.debug(`Retrieved ${data.length} location points`);
        return data;
      } catch (error) {
        // OpenF1 은 매칭 데이터가 없으면 404 "No results found." 를 반환한다.
        // /location 윈도우 청크는 레이스 종료 뒤 빈 구간까지 요청하게 되므로,
        // 이 404 는 장애가 아니라 정상적인 "빈 결과" → [] 로 처리해 전체 빌드 중단을 막는다.
        // (빈 [] 는 상위 캐시 레이어가 저장하지 않으므로 영구 결손도 생기지 않는다.)
        if (error instanceof AxiosError && error.response?.status === 404) {
          this.logger.debug('location: 404 No results found → 빈 결과로 처리');
          return [];
        }
        this.logger.error(
          `OpenF1 API Error (location): ${(error as AxiosError).message}`,
        );
        throw new HttpException(
          'Failed to fetch location data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }, []);
  }

  /**
   * 한 드라이버의 레이스 윈도우 location 을 date 청크로 나눠 순차 수집.
   *
   * /location 은 세션·드라이버당 수만 행(~3.7Hz) → 한 번에 받으면 응답이 과대하고 429 위험.
   * [dateGt, dateLt] 를 chunkMinutes 단위로 쪼개 순차 요청(병렬 금지=rate-limit 회피),
   * 경계 중복 샘플은 date 로 dedupe 후 시간순 정렬해 반환.
   * 윈도우(dateGt/dateLt)가 없으면 단일 요청으로 폴백.
   */
  async fetchLocationWindow(
    sessionKey: number,
    driverNumber: number,
    dateGt?: string,
    dateLt?: string,
    chunkMinutes = 20,
  ): Promise<OpenF1Location[]> {
    const boundaries = this.dateChunks(dateGt, dateLt, chunkMinutes);
    if (!boundaries) {
      return this.fetchLocation({
        session_key: sessionKey,
        driver_number: driverNumber,
        dateGt,
        dateLt,
      });
    }

    const byDate = new Map<string, OpenF1Location>();
    for (let i = 0; i < boundaries.length - 1; i++) {
      // 청크 사이 간격: /location 연속 호출이 OpenF1 rate limit(429)을 유발해
      // 회로차단기까지 트립시키는 것을 예방(드라이버×청크 = 세션당 수십~수백 요청).
      if (i > 0) await this.delay(OpenF1ClientService.LOCATION_CHUNK_DELAY_MS);
      const chunk = await this.fetchLocation({
        session_key: sessionKey,
        driver_number: driverNumber,
        dateGt: boundaries[i],
        dateLt: boundaries[i + 1],
      });
      for (const row of chunk) byDate.set(row.date, row); // 경계 중복 제거
    }

    return Array.from(byDate.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  // [gt, lt] 를 chunkMinutes 간격 ISO 경계 배열로. 윈도우 불완전/역전이면 null(단일요청 폴백).
  private dateChunks(
    dateGt?: string,
    dateLt?: string,
    chunkMinutes = 20,
  ): string[] | null {
    if (!dateGt || !dateLt) return null;
    const start = new Date(dateGt).getTime();
    const end = new Date(dateLt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
    const step = chunkMinutes * 60 * 1000;
    if (end - start <= step) return null; // 한 청크면 단일요청 폴백

    const out: string[] = [];
    for (let t = start; t < end; t += step) {
      out.push(new Date(t).toISOString());
    }
    out.push(new Date(end).toISOString());
    return out;
  }

  // /location 전용 URL 조립 (date>=, date<= 연산자는 인코딩하지 않고 값만 인코딩).
  private buildLocationUrl(params: LocationQueryParams): string {
    const parts: string[] = [`session_key=${params.session_key}`];
    if (params.driver_number !== undefined) {
      parts.push(`driver_number=${params.driver_number}`);
    }
    if (params.dateGt) {
      parts.push(`date>=${encodeURIComponent(params.dateGt)}`);
    }
    if (params.dateLt) {
      parts.push(`date<=${encodeURIComponent(params.dateLt)}`);
    }
    return `${this.baseUrl}/location?${parts.join('&')}`;
  }

  private buildUrl(endpoint: string, params: object): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    Object.entries(params).forEach(([key, value]: [string, unknown]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, `${value as string | number | boolean}`);
      }
    });

    return url.toString();
  }

  /**
   * Get Circuit Breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset Circuit Breaker manually
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
    this.logger.log('Circuit Breaker manually reset');
  }

  private handleError(method: string, error: unknown): never {
    this.logger.error(`Error in ${method}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    throw new HttpException(
      'Internal server error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
