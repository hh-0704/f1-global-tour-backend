import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CachedOpenF1ClientService } from './cached-openf1-client.service';

/**
 * Base service class for all F1 data services
 * Provides common functionality like error handling, logging, and data operations
 */
@Injectable()
export abstract class BaseF1Service {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly cachedOpenf1Client: CachedOpenF1ClientService,
  ) {}

  /**
   * Execute an operation with standardized error handling and logging
   * @param operation - The async operation to execute
   * @param operationName - Human-readable operation description for logging
   * @param context - Additional context for logging (optional)
   */
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      if (context) {
        this.logger.debug(`${operationName} with context:`, context);
      } else {
        this.logger.debug(operationName);
      }

      const result = await operation();

      this.logger.log(`Successfully completed: ${operationName}`);
      return result;
    } catch (error) {
      this.logger.error(`Error ${operationName}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to ${operationName}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 가공 결과(무거운 계산) 캐시 공통 흐름 (plan.md §6 logic_version 무효화).
   *
   * 1. load() 로 캐시 조회 — 저장된 logic_version === 코드 상수일 때만 hit (다르면 재계산).
   * 2. miss 면 compute() 로 계산.
   * 3. shouldPersist(결과) && 끝난 세션일 때만 save() 로 영구 저장 (규칙 ①·④ 정신).
   *    진행 중 세션·빈 결과는 저장하지 않아 영구 결손/stale 방지.
   * DB 장애는 경고 로그 후 계산 결과로 graceful degradation.
   */
  protected async getCachedComputed<T>(
    sessionKey: number,
    logicVersion: number,
    load: () => Promise<{ logicVersion: number; payload: T } | null>,
    compute: () => Promise<T>,
    save: (payload: T) => Promise<unknown>,
    shouldPersist: (payload: T) => boolean = () => true,
  ): Promise<T> {
    try {
      const cached = await load();
      if (cached && cached.logicVersion === logicVersion) {
        return cached.payload;
      }
    } catch (e) {
      this.logger.warn(
        `가공 결과 캐시 조회 실패(session=${sessionKey}): ${this.errMsg(e)}`,
      );
    }

    const result = await compute();

    if (
      shouldPersist(result) &&
      (await this.cachedOpenf1Client.isSessionFinal(sessionKey))
    ) {
      try {
        await save(result);
      } catch (e) {
        this.logger.warn(
          `가공 결과 캐시 저장 실패(session=${sessionKey}): ${this.errMsg(e)}`,
        );
      }
    }
    return result;
  }

  /** jsonb 컬럼 저장용 캐스팅 (Prisma InputJsonValue). */
  protected toJson(data: unknown): Prisma.InputJsonValue {
    return data as Prisma.InputJsonValue;
  }

  protected errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  /**
   * Validate that a session exists and has data
   * @param sessionKey - Session to validate
   * @param dataType - Type of data being validated for better error messages
   */
  protected async validateSession(
    sessionKey: number,
    dataType: string = 'data',
  ): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      const drivers = await this.cachedOpenf1Client.fetchDrivers({
        session_key: sessionKey,
      });

      if (drivers.length === 0) {
        throw new HttpException(
          `Session ${sessionKey} not found or has no ${dataType}`,
          HttpStatus.NOT_FOUND,
        );
      }
    }, `validate session ${sessionKey} for ${dataType}`);
  }

  /**
   * Filter array data by driver number if provided
   * @param data - Array to filter
   * @param driverNumber - Optional driver number to filter by
   * @param driverField - Field name that contains driver number (default: 'driverNumber')
   */
  protected filterByDriver<T>(
    data: T[],
    driverNumber?: number,
    driverField: string = 'driverNumber',
  ): T[] {
    if (!driverNumber) {
      return data;
    }

    return data.filter(
      (item) => (item as Record<string, unknown>)[driverField] === driverNumber,
    );
  }

  /**
   * Calculate basic statistics for numerical arrays
   * @param values - Array of numbers
   * @param filterNulls - Whether to filter out null/undefined values
   */
  protected calculateStatistics(
    values: (number | null)[],
    filterNulls: boolean = true,
  ): {
    count: number;
    min: number | null;
    max: number | null;
    average: number | null;
    sum: number | null;
  } {
    const filteredValues = filterNulls
      ? values.filter((v): v is number => v !== null && v !== undefined)
      : (values as number[]);

    if (filteredValues.length === 0) {
      return {
        count: 0,
        min: null,
        max: null,
        average: null,
        sum: null,
      };
    }

    const sum = filteredValues.reduce((acc, val) => acc + val, 0);

    return {
      count: filteredValues.length,
      min: Math.min(...filteredValues),
      max: Math.max(...filteredValues),
      average: sum / filteredValues.length,
      sum,
    };
  }

  /**
   * Group array data by a specific field
   * @param data - Array to group
   * @param groupByField - Field to group by
   */
  protected groupBy<T>(data: T[], groupByField: keyof T): Record<string, T[]> {
    return data.reduce(
      (groups, item) => {
        const key = String(item[groupByField]);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
        return groups;
      },
      {} as Record<string, T[]>,
    );
  }

  /**
   * Sort data by timestamp in ascending order
   * @param data - Array to sort
   * @param timestampField - Field containing timestamp (default: 'timestamp')
   */
  protected sortByTimestamp<T>(
    data: T[],
    timestampField: string = 'timestamp',
  ): T[] {
    return [...data].sort((a, b) => {
      const aRecord = a as Record<string, unknown>;
      const bRecord = b as Record<string, unknown>;
      const timeA = new Date(aRecord[timestampField] as string).getTime();
      const timeB = new Date(bRecord[timestampField] as string).getTime();
      return timeA - timeB;
    });
  }

  /**
   * Convert time string to seconds for calculations
   * @param timeString - Time string in various formats
   */
  protected convertTimeToSeconds(timeString: string | null): number | null {
    if (
      !timeString ||
      timeString === '0:00:00' ||
      timeString.includes('null')
    ) {
      return null;
    }

    try {
      const parts = timeString.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
      }

      return parseFloat(timeString) || null;
    } catch {
      return null;
    }
  }

  /**
   * Create consistent API response structure
   * @param sessionKey - Session key
   * @param data - Main data payload
   * @param metadata - Additional metadata (optional)
   */
  protected createResponse<T>(
    sessionKey: number,
    data: T,
    metadata?: Record<string, unknown>,
  ): {
    sessionKey: number;
    data: T;
    timestamp: string;
  } & Record<string, unknown> {
    return {
      sessionKey,
      data,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }
}
