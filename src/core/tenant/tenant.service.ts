import { Prisma, TenantStatus } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { cacheRedis, scanAndDelete } from '../../config/redis';
import { ApiError } from '../../shared/errors';
import { createRedisPattern, createTenantCacheKey } from '../../shared/utils';
import { logger } from '../../config/logger';

export interface CreateTenantData {
  companyId: string;
  schemaName?: string;
  status?: TenantStatus;
}

export interface UpdateTenantData {
  status?: TenantStatus;
  schemaName?: string;
}

export class TenantService {
  // Create new tenant
  async createTenant(tenantData: CreateTenantData) {
    const { companyId, schemaName, status = TenantStatus.ACTIVE } = tenantData;

    // Check if company already has a tenant
    const existingTenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
    });

    if (existingTenant) {
      throw ApiError.conflict('Company already has a tenant');
    }

    // Generate schema name if not provided
    const finalSchemaName = schemaName || `tenant_${companyId.replace(/-/g, '_')}`;

    // Check if schema name is unique
    const existingSchema = await platformPrisma.tenant.findUnique({
      where: { schemaName: finalSchemaName },
    });

    if (existingSchema) {
      throw ApiError.conflict('Schema name already exists');
    }

    // Create tenant
    const createData: Prisma.TenantUncheckedCreateInput = {
      companyId,
      schemaName: finalSchemaName,
      status,
    };

    const tenant = await platformPrisma.tenant.create({
      data: createData,
      include: {
        company: true,
      },
    });

    // TODO: Create database schema and run migrations
    await this.createTenantSchema(tenant.schemaName);

    // Cache tenant data
    await this.cacheTenantData(tenant.id, tenant);

    logger.info(`Tenant created: ${tenant.id} (${tenant.schemaName})`);

    return tenant;
  }

  // Get tenant by ID
  async getTenantById(tenantId: string) {
    // Check cache first
    const cacheKey = createTenantCacheKey(tenantId);
    const cachedData = await cacheRedis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Fetch from database
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found');
    }

    // Cache the data
    await this.cacheTenantData(tenantId, tenant);

    return tenant;
  }

  // Get tenant by company ID
  async getTenantByCompanyId(companyId: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found for this company');
    }

    return tenant;
  }

  // Get tenant by schema name
  async getTenantBySchema(schemaName: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { schemaName },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found for this schema');
    }

    return tenant;
  }

  // Update tenant
  async updateTenant(tenantId: string, updateData: UpdateTenantData) {
    const data: Prisma.TenantUncheckedUpdateInput = {
      ...(typeof updateData.schemaName !== 'undefined' ? { schemaName: updateData.schemaName } : {}),
      ...(typeof updateData.status !== 'undefined' ? { status: updateData.status } : {}),
    };

    const tenant = await platformPrisma.tenant.update({
      where: { id: tenantId },
      data,
      include: {
        company: true,
      },
    });

    // Update cache
    await this.cacheTenantData(tenantId, tenant);

    // Clear related caches
    await cacheRedis.del(createTenantCacheKey(tenantId, 'config'));

    logger.info(`Tenant updated: ${tenantId}`);

    return tenant;
  }

  // Delete tenant
  async deleteTenant(tenantId: string) {
    // Get tenant info before deletion
    const tenant = await this.getTenantById(tenantId);

    // TODO: Drop database schema
    await this.dropTenantSchema(tenant.schemaName);

    // Delete tenant
    await platformPrisma.tenant.delete({
      where: { id: tenantId },
    });

    // Clear cache
    await this.clearTenantCache(tenantId);

    logger.info(`Tenant deleted: ${tenantId}`);

    return { message: 'Tenant deleted successfully' };
  }

  // List tenants with pagination
  async listTenants(options: {
    page?: number;
    limit?: number;
    status?: TenantStatus;
    search?: string;
  } = {}) {
    const { page = 1, limit = 25, status, search } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.company = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { contactPerson: { path: ['email'], string_contains: search } },
        ],
      };
    }

    const [tenants, total] = await Promise.all([
      platformPrisma.tenant.findMany({
        where,
        include: {
          company: true,
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.tenant.count({ where }),
    ]);

    return {
      tenants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Provision tenant schema
  private async createTenantSchema(schemaName: string): Promise<void> {
    try {
      // Create schema
      await platformPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // TODO: Run tenant-specific migrations
      // This would typically involve running migration scripts for the tenant schema

      logger.info(`Tenant schema created: ${schemaName}`);
    } catch (error) {
      logger.error(`Failed to create tenant schema ${schemaName}:`, error);
      throw ApiError.internal('Failed to create tenant schema');
    }
  }

  // Drop tenant schema
  private async dropTenantSchema(schemaName: string): Promise<void> {
    try {
      // Drop schema and all its contents
      await platformPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

      logger.info(`Tenant schema dropped: ${schemaName}`);
    } catch (error) {
      logger.error(`Failed to drop tenant schema ${schemaName}:`, error);
      throw ApiError.internal('Failed to drop tenant schema');
    }
  }

  // Cache tenant data
  private async cacheTenantData(tenantId: string, tenantData: any): Promise<void> {
    const cacheKey = createTenantCacheKey(tenantId);
    await cacheRedis.setex(cacheKey, 86400, JSON.stringify(tenantData)); // 24 hours
  }

  // Clear tenant cache
  private async clearTenantCache(tenantId: string): Promise<void> {
    await scanAndDelete(cacheRedis, createRedisPattern('tenant', tenantId, '*'));
  }

  // Get tenant statistics
  async getTenantStats(): Promise<{
    total: number;
    active: number;
    suspended: number;
    trial: number;
  }> {
    const stats = await platformPrisma.tenant.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    const result = {
      total: 0,
      active: 0,
      suspended: 0,
      trial: 0,
    };

    stats.forEach((stat: any) => {
      result.total += stat._count.status;
      switch (stat.status) {
        case 'ACTIVE':
          result.active = stat._count.status;
          break;
        case 'SUSPENDED':
          result.suspended = stat._count.status;
          break;
        case 'TRIAL':
          result.trial = stat._count.status;
          break;
      }
    });

    return result;
  }
}

export const tenantService = new TenantService();
