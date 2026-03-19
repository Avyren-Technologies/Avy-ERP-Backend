import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

export class AuditService {
  // ────────────────────────────────────────────────────────────────────
  // List audit logs with pagination and filters
  // ────────────────────────────────────────────────────────────────────
  async listAuditLogs(options: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    tenantId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  } = {}) {
    const { page = 1, limit = 25, action, entityType, userId, tenantId, dateFrom, dateTo, search } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = userId;
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) {
        where.timestamp.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.timestamp.lte = new Date(dateTo);
      }
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      platformPrisma.auditLog.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      platformPrisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get a single audit log by ID
  // ────────────────────────────────────────────────────────────────────
  async getAuditLogById(id: string) {
    return platformPrisma.auditLog.findUnique({
      where: { id },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Get audit logs for a specific entity
  // ────────────────────────────────────────────────────────────────────
  async getAuditLogsByEntity(entityType: string, entityId: string, limit = 50) {
    return platformPrisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Get distinct action types (for filter dropdowns)
  // ────────────────────────────────────────────────────────────────────
  async getActionTypes() {
    const results = await platformPrisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });

    return results.map((r) => r.action);
  }

  // ────────────────────────────────────────────────────────────────────
  // Get distinct entity types (for filter dropdowns)
  // ────────────────────────────────────────────────────────────────────
  async getEntityTypes() {
    const results = await platformPrisma.auditLog.findMany({
      distinct: ['entityType'],
      select: { entityType: true },
      orderBy: { entityType: 'asc' },
    });

    return results.map((r) => r.entityType);
  }
}

export const auditService = new AuditService();
