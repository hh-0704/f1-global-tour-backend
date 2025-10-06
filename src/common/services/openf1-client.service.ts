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
} from '../interfaces/openf1.interface';
import {
  SessionsQueryParams,
  DriversQueryParams,
  LapsQueryParams,
  CarDataQueryParams,
  IntervalsQueryParams,
  RaceControlQueryParams,
  StintsQueryParams,
} from '../interfaces/query-params.interface';

@Injectable()
export class OpenF1ClientService {
  private readonly logger = new Logger(OpenF1ClientService.name);
  private readonly baseUrl: string;

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
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/drivers', params);
        this.logger.debug(`Fetching drivers from: ${url}`);

        const response$ = this.httpService.get<OpenF1Driver[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (drivers): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch driver data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} drivers`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/laps', params);
        this.logger.debug(`Fetching laps from: ${url}`);

        const response$ = this.httpService.get<OpenF1Lap[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (laps): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch lap data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} laps`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/car_data', params);
        this.logger.debug(`Fetching car data from: ${url}`);

        const response$ = this.httpService.get<OpenF1CarData[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (car_data): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch car telemetry data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} car data points`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchIntervals(
    params: IntervalsQueryParams,
  ): Promise<OpenF1Interval[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/intervals', params);
        this.logger.debug(`Fetching intervals from: ${url}`);

        const response$ = this.httpService.get<OpenF1Interval[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (intervals): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch interval data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} interval points`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchRaceControl(
    params: RaceControlQueryParams,
  ): Promise<OpenF1RaceControl[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/race_control', params);
        this.logger.debug(`Fetching race control from: ${url}`);

        const response$ = this.httpService.get<OpenF1RaceControl[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (race_control): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch race control data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(
          `Retrieved ${response.data.length} race control messages`,
        );

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]> {
    return this.circuitBreaker.execute(
      async () => {
        const url = this.buildUrl('/stints', params);
        this.logger.debug(`Fetching stints from: ${url}`);

        const response$ = this.httpService.get<OpenF1Stint[]>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `OpenF1 API Error (stints): ${error.message}`,
              error.stack,
            );
            throw new HttpException(
              'Failed to fetch stint data',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        );

        const response = await firstValueFrom(response$);
        this.logger.debug(`Retrieved ${response.data.length} stints`);

        return response.data;
      },
      [], // Empty array as fallback
    );
  }

  private buildUrl(endpoint: string, params: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
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

  private handleError(method: string, error: any): never {
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
