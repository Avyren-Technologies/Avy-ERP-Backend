// Cache service for managing Redis operations

import { cacheRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { CACHE_TTL } from '../../shared/constants';

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
    const key = `user:auth:${userId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setUserData(userId: string, data: any, ttl = CACHE_TTL.USER_SESSION): Promise<void> {
    const key = `user:auth:${userId}`;
    await this.set(key, JSON.stringify(data), ttl);
  }

  async invalidateUserSession(userId: string): Promise<void> {
    const key = `user:auth:${userId}`;
    await this.del(key);
  }

  // Tenant-specific cache operations
  async getTenantData(tenantId: string): Promise<any | null> {
    const key = `tenant:config:${tenantId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setTenantData(tenantId: string, data: any, ttl = CACHE_TTL.TENANT_CONFIG): Promise<void> {
    const key = `tenant:config:${tenantId}`;
    await this.set(key, JSON.stringify(data), ttl);
  }

  async invalidateTenantCache(tenantId: string): Promise<void> {
    const pattern = `tenant:${tenantId}:*`;
    // Note: This is a simplified version. In production, you'd want to use Redis SCAN
    const keys = await cacheRedis.keys(pattern);
    if (keys.length > 0) {
      await cacheRedis.del(keys);
    }
  }

  // Module configuration cache
  async getModuleConfig(tenantId: string, moduleName: string): Promise<any | null> {
    const key = `module:config:${tenantId}:${moduleName}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setModuleConfig(tenantId: string, moduleName: string, config: any, ttl = CACHE_TTL.MODULE_CONFIG): Promise<void> {
    const key = `module:config:${tenantId}:${moduleName}`;
    await this.set(key, JSON.stringify(config), ttl);
  }

  // Analytics cache
  async getAnalyticsData(tenantId: string, type: string, period: string): Promise<any | null> {
    const key = `analytics:${type}:${tenantId}:${period}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setAnalyticsData(tenantId: string, type: string, period: string, data: any, ttl = 3600): Promise<void> {
    const key = `analytics:${type}:${tenantId}:${period}`;
    await this.set(key, JSON.stringify(data), ttl);
  }

  // Report cache
  async getReportData(reportId: string): Promise<any | null> {
    const key = `report:data:${reportId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setReportData(reportId: string, data: any, ttl = 86400): Promise<void> { // 24 hours
    const key = `report:data:${reportId}`;
    await this.set(key, JSON.stringify(data), ttl);
  }

  // Bulk operations
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await cacheRedis.keys(pattern);
      if (keys.length > 0) {
        await cacheRedis.del(keys);
        logger.info(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
      throw error;
    }
  }

  // Cache statistics
  async getStats(): Promise<{
    info: any;
    keyCount: number;
  }> {
    try {
      const info = await cacheRedis.info();
      const keys = await cacheRedis.keys('*');
      return {
        info,
        keyCount: keys.length,
      };
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