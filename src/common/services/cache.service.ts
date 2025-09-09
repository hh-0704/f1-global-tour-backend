import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType;
  private readonly defaultTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultTtl = this.configService.get<number>('cache.ttl') || 300; // 5 minutes default
    this.initializeRedisClient();
  }

  private async initializeRedisClient() {
    const redisHost = this.configService.get<string>('redis.host') || 'localhost';
    const redisPort = this.configService.get<number>('redis.port') || 6379;
    const redisPassword = this.configService.get<string>('redis.password') || '';

    this.client = createClient({
      socket: {
        host: redisHost,
        port: redisPort,
      },
      password: redisPassword || undefined,
    });

    // Suppress Redis error logging to avoid spam when Redis is not available
    this.client.on('error', () => {
      // Silent fail - Redis errors are handled gracefully in methods
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${redisHost}:${redisPort}`);
    });

    this.client.on('ready', () => {
      this.logger.log('Redis client is ready');
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.warn('Redis not available - running without cache');
      // Don't throw error - allow app to run without Redis
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.client.isReady) {
        this.logger.warn('Redis client is not ready, skipping cache get');
        return null;
      }

      const value = await this.client.get(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(value) as T;
      }

      this.logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      if (!this.client.isReady) {
        this.logger.warn('Redis client is not ready, skipping cache set');
        return;
      }

      const ttl = options?.ttl || this.defaultTtl;
      const serializedValue = JSON.stringify(value);

      await this.client.setEx(key, ttl, serializedValue);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.client.isReady) {
        this.logger.warn('Redis client is not ready, skipping cache delete');
        return;
      }

      await this.client.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}:`, error);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      if (!this.client.isReady) {
        this.logger.warn('Redis client is not ready, skipping pattern delete');
        return;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.debug(`Cache DEL pattern: ${pattern} (${keys.length} keys)`);
      }
    } catch (error) {
      this.logger.error(`Error deleting cache pattern ${pattern}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.client.isReady) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking cache key existence ${key}:`, error);
      return false;
    }
  }

  async flush(): Promise<void> {
    try {
      if (!this.client.isReady) {
        this.logger.warn('Redis client is not ready, skipping flush');
        return;
      }

      await this.client.flushAll();
      this.logger.log('Cache flushed');
    } catch (error) {
      this.logger.error('Error flushing cache:', error);
    }
  }

  // F1-specific cache key generators
  generateSessionKey(sessionKey: number, dataType: string): string {
    return `session:${sessionKey}:${dataType}`;
  }

  generateDriverKey(sessionKey: number, driverNumber: number, dataType: string): string {
    return `session:${sessionKey}:driver:${driverNumber}:${dataType}`;
  }

  generateLapKey(sessionKey: number, lapNumber?: number): string {
    if (lapNumber) {
      return `session:${sessionKey}:lap:${lapNumber}`;
    }
    return `session:${sessionKey}:laps`;
  }

  // Session-specific cache management
  async clearSessionCache(sessionKey: number): Promise<void> {
    const pattern = `session:${sessionKey}:*`;
    await this.delPattern(pattern);
    this.logger.log(`Cleared all cache for session ${sessionKey}`);
  }

  // Get cache statistics
  async getStats(): Promise<{
    connected: boolean;
    keyCount?: number;
    memoryUsage?: string;
  }> {
    try {
      if (!this.client.isReady) {
        return { connected: false };
      }

      const keyCount = await this.client.dbSize();
      const info = await this.client.info('memory');
      
      return {
        connected: true,
        keyCount,
        memoryUsage: this.extractMemoryInfo(info),
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return { connected: false };
    }
  }

  private extractMemoryInfo(info: string): string {
    const lines = info.split('\r\n');
    const memoryLine = lines.find(line => line.startsWith('used_memory_human:'));
    return memoryLine ? memoryLine.split(':')[1] : 'unknown';
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('Redis client disconnected');
    }
  }
}