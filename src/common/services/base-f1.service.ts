import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from './cached-openf1-client.service';

/**
 * Base service class for all F1 data services
 * Provides common functionality like error handling, logging, and data operations
 */
@Injectable()
export abstract class BaseF1Service {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly cachedOpenf1Client: CachedOpenF1ClientService
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
    context?: Record<string, any>
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
   * Validate that a session exists and has data
   * @param sessionKey - Session to validate
   * @param dataType - Type of data being validated for better error messages
   */
  protected async validateSession(sessionKey: number, dataType: string = 'data'): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      const drivers = await this.cachedOpenf1Client.fetchDrivers({ session_key: sessionKey });
      
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
    driverField: string = 'driverNumber'
  ): T[] {
    if (!driverNumber) {
      return data;
    }
    
    return data.filter((item: any) => item[driverField] === driverNumber);
  }

  /**
   * Calculate basic statistics for numerical arrays
   * @param values - Array of numbers
   * @param filterNulls - Whether to filter out null/undefined values
   */
  protected calculateStatistics(
    values: (number | null)[], 
    filterNulls: boolean = true
  ): {
    count: number;
    min: number | null;
    max: number | null;
    average: number | null;
    sum: number | null;
  } {
    const filteredValues = filterNulls 
      ? values.filter((v): v is number => v !== null && v !== undefined)
      : values as number[];

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
    return data.reduce((groups, item) => {
      const key = String(item[groupByField]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * Sort data by timestamp in ascending order
   * @param data - Array to sort
   * @param timestampField - Field containing timestamp (default: 'timestamp')
   */
  protected sortByTimestamp<T>(data: T[], timestampField: string = 'timestamp'): T[] {
    return [...data].sort((a: any, b: any) => {
      const timeA = new Date(a[timestampField]).getTime();
      const timeB = new Date(b[timestampField]).getTime();
      return timeA - timeB;
    });
  }

  /**
   * Convert time string to seconds for calculations
   * @param timeString - Time string in various formats
   */
  protected convertTimeToSeconds(timeString: string | null): number | null {
    if (!timeString || timeString === '0:00:00' || timeString.includes('null')) {
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
    metadata?: Record<string, any>
  ): {
    sessionKey: number;
    data: T;
    timestamp: string;
  } & Record<string, any> {
    return {
      sessionKey,
      data,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }
}