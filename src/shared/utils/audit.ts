import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Compute shallow diff between two objects.
 * Returns only changed fields as {field: {from, to}}.
 * Excludes updatedAt, createdAt.
 */
export function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {};
  const skipFields = new Set(['updatedAt', 'createdAt']);

  for (const key of Object.keys(after)) {
    if (skipFields.has(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { from: oldVal, to: newVal };
    }
  }
  return diff;
}

/**
 * Create an audit log entry.
 * Fire-and-forget — errors are logged but don't throw.
 */
export async function auditLog(params: {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
  before?: Record<string, any>;
  after?: Record<string, any>;
  changedBy: string;
  companyId: string;
  retentionMonths?: number;
}): Promise<void> {
  try {
    const { entityType, entityId, action, before, after, changedBy, companyId, retentionMonths = 12 } = params;

    let changes: Record<string, any> | null = null;

    if (action === 'CREATE' && after) {
      // Full snapshot for creates
      changes = Object.fromEntries(
        Object.entries(after)
          .filter(([k]) => !['createdAt', 'updatedAt'].includes(k))
          .map(([k, v]) => [k, { to: v }]),
      );
    } else if (action === 'DELETE' && before) {
      // Full snapshot for deletes
      changes = Object.fromEntries(
        Object.entries(before)
          .filter(([k]) => !['createdAt', 'updatedAt'].includes(k))
          .map(([k, v]) => [k, { from: v }]),
      );
    } else if ((action === 'UPDATE' || action === 'STATUS_CHANGE') && before && after) {
      changes = computeDiff(before, after);
    }

    const retentionDate = new Date();
    retentionDate.setMonth(retentionDate.getMonth() + retentionMonths);

    await platformPrisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        ...(changes ? { changes } : {}),
        changedBy,
        retentionDate,
        companyId,
      },
    });
  } catch (err) {
    logger.error('Audit log creation failed', err);
    // Don't throw — audit failure shouldn't break the main flow
  }
}

/**
 * Query audit log entries for an entity.
 */
export async function queryAuditLog(
  companyId: string,
  options: { entityType?: string; entityId?: string; page?: number; limit?: number },
) {
  const { entityType, entityId, page = 1, limit = 20 } = options;
  const where: any = { companyId };
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    platformPrisma.auditLog.findMany({
      where,
      orderBy: { changedAt: 'desc' },
      skip,
      take: limit,
    }),
    platformPrisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
}
