// Database connection utilities for infrastructure operations

import { platformPrisma, createTenantPrisma } from '../../config/database';
import { logger } from '../../config/logger';

export class DatabaseConnection {
  // Get platform database connection
  static getPlatformConnection() {
    return platformPrisma;
  }

  // Get tenant-specific database connection
  static getTenantConnection(schemaName: string) {
    return createTenantPrisma(schemaName);
  }

  // Execute raw SQL on platform database
  static async executePlatformQuery(query: string, params?: any[]) {
    try {
      const result = await platformPrisma.$queryRawUnsafe(query, ...(params || []));
      return result;
    } catch (error) {
      logger.error('Platform database query failed:', error);
      throw error;
    }
  }

  // Execute raw SQL on tenant database
  static async executeTenantQuery(schemaName: string, query: string, params?: any[]) {
    const tenantPrisma = createTenantPrisma(schemaName);

    try {
      const result = await tenantPrisma.$queryRawUnsafe(query, ...(params || []));
      return result;
    } catch (error) {
      logger.error(`Tenant database query failed for schema ${schemaName}:`, error);
      throw error;
    } finally {
      await tenantPrisma.$disconnect();
    }
  }

  // Check if schema exists
  static async schemaExists(schemaName: string): Promise<boolean> {
    try {
      const result = await this.executePlatformQuery(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        [schemaName]
      );
      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      logger.error(`Failed to check if schema ${schemaName} exists:`, error);
      return false;
    }
  }

  // Get database statistics
  static async getDatabaseStats() {
    try {
      const stats = await this.executePlatformQuery(`
        SELECT
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        LIMIT 100
      `);

      return stats;
    } catch (error) {
      logger.error('Failed to get database statistics:', error);
      throw error;
    }
  }

  // Health check
  static async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      // Test platform connection
      await platformPrisma.$queryRaw`SELECT 1`;

      // Get basic stats
      const tenantCount = await platformPrisma.tenant.count();
      const userCount = await platformPrisma.user.count();

      return {
        status: 'healthy',
        details: {
          platform: 'connected',
          tenants: tenantCount,
          users: userCount,
        },
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}