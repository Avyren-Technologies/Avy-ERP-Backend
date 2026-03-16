// Cache service for managing Redis operations

import { cacheRedis, scanAndDelete } from '../../config/redis';
import { logger } from '../../config/logger';
import { CACHE_TTL } from '../../shared/constants';
import {
  createAnalyticsCacheKey,
  createModuleConfigCacheKey,
  createRedisPattern,
  createRootRedisPattern,
  createStoredReportCacheKey,
  createTenantCacheKey,
  createUserCacheKey,
} from '../../shared/utils';

export class CacheService {
  // Generic cache operations
  async get(key: string): Promise<string | null> {
    try {
      return await cacheRedis.get(key);
    } catch (error) {
      logger.error(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await cacheRedis.setex(key, ttl, value);
      } else {
        await cacheRedis.set(key, value);
      }
    } catch (error) {
      logger.error(`Cache set failed for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await cacheRedis.del(key);
    } catch (error) {
      logger.error(`Cache delete failed for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await cacheRedis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists check failed for key ${key}:`, error);
      return false;
    }
  }

  // User-specific cache operations
  async getUserData(userId: string): Promise<any | null> {
    const key = createUserCacheKey(userId, 'auth');
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setUserData(userId: string, data: any, ttl = CACHE_TTL.USER_SESSION): Promise<void> {
    const key = createUserCacheKey(userId, 'auth');
    await this.set(key, JSON.stringify(data), ttl);
  }

  async invalidateUserSession(userId: string): Promise<void> {
    const key = createUserCacheKey(userId, 'auth');
    await this.del(key);
  }

  // Tenant-specific cache operations
  async getTenantData(tenantId: string): Promise<any | null> {
    const key = createTenantCacheKey(tenantId, 'config');
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setTenantData(tenantId: string, data: any, ttl = CACHE_TTL.TENANT_CONFIG): Promise<void> {
    const key = createTenantCacheKey(tenantId, 'config');
    await this.set(key, JSON.stringify(data), ttl);
  }

  async invalidateTenantCache(tenantId: string): Promise<void> {
    const pattern = createRedisPattern('tenant', tenantId, '*');
    await scanAndDelete(cacheRedis, pattern);
  }

  // Module configuration cache
  async getModuleConfig(tenantId: string, moduleName: string): Promise<any | null> {
    const key = createModuleConfigCacheKey(tenantId, moduleName);
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setModuleConfig(tenantId: string, moduleName: string, config: any, ttl = CACHE_TTL.MODULE_CONFIG): Promise<void> {
    const key = createModuleConfigCacheKey(tenantId, moduleName);
    await this.set(key, JSON.stringify(config), ttl);
  }

  // Analytics cache
  async getAnalyticsData(tenantId: string, type: string, period: string): Promise<any | null> {
    const key = createAnalyticsCacheKey(type, tenantId, period);
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setAnalyticsData(tenantId: string, type: string, period: string, data: any, ttl = 3600): Promise<void> {
    const key = createAnalyticsCacheKey(type, tenantId, period);
    await this.set(key, JSON.stringify(data), ttl);
  }

  // Report cache
  async getReportData(reportId: string): Promise<any | null> {
    const key = createStoredReportCacheKey(reportId);
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setReportData(reportId: string, data: any, ttl = 86400): Promise<void> { // 24 hours
    const key = createStoredReportCacheKey(reportId);
    await this.set(key, JSON.stringify(data), ttl);
  }

  // Bulk operations — callers must supply a module name and optional sub-parts.
  // The method builds a fully-prefixed pattern internally, preventing any
  // caller from accidentally wiping keys outside their module namespace.
  async invalidatePattern(moduleName: string, ...parts: string[]): Promise<void> {
    const pattern = createRedisPattern(moduleName, ...parts);
    try {
      const deleted = await scanAndDelete(cacheRedis, pattern);
      if (deleted > 0) {
        logger.info(`Invalidated ${deleted} cache keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
      throw error;
    }
  }

  // Cache statistics — counts only keys owned by this service (prefix-scoped).
  async getStats(): Promise<{
    info: any;
    keyCount: number;
  }> {
    try {
      const info = await cacheRedis.info();
      const pattern = createRootRedisPattern();
      let cursor = '0';
      let keyCount = 0;
      do {
        const [nextCursor, keys] = await cacheRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keyCount += keys.length;
      } while (cursor !== '0');
      return { info, keyCount };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await cacheRedis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Cache health check failed:', error);
      return false;
    }
  }
}

export const cacheService = new CacheService();
