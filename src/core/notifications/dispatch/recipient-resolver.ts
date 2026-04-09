import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';

export interface RecipientContext {
  companyId: string;
  requesterId?: string | undefined;
  approverIds?: string[] | undefined;
  managerId?: string | undefined;
  departmentId?: string | undefined;
}

/**
 * Resolve a recipientRole token to a list of User IDs for a given dispatch.
 *
 * Supported role tokens:
 *   REQUESTER / EMPLOYEE — the user who initiated the action
 *   APPROVER             — users in the current approval step
 *   MANAGER              — reporting manager of the requester (via Employee.reportingManager)
 *   HR / FINANCE / IT / ADMIN — users with matching tenant role
 *   ALL                  — all active users in the company (used sparingly)
 */
export async function resolveRecipients(role: string, ctx: RecipientContext): Promise<string[]> {
  const normalized = role.toUpperCase();

  switch (normalized) {
    case 'REQUESTER':
    case 'EMPLOYEE':
    case 'SELF':
      return ctx.requesterId ? [ctx.requesterId] : [];

    case 'APPROVER':
    case 'APPROVERS':
      return ctx.approverIds ?? [];

    case 'MANAGER':
    case 'REPORTING_MANAGER': {
      if (ctx.managerId) return [ctx.managerId];
      if (!ctx.requesterId) return [];
      try {
        const requesterUser = await platformPrisma.user.findUnique({
          where: { id: ctx.requesterId },
          select: { employeeId: true },
        });
        if (!requesterUser?.employeeId) return [];
        const emp = await platformPrisma.employee.findUnique({
          where: { id: requesterUser.employeeId },
          select: { reportingManagerId: true },
        });
        if (!emp?.reportingManagerId) return [];
        const mgrEmp = await platformPrisma.employee.findUnique({
          where: { id: emp.reportingManagerId },
          select: { user: { select: { id: true } } },
        });
        return mgrEmp?.user?.id ? [mgrEmp.user.id] : [];
      } catch (err) {
        logger.warn('Failed to resolve MANAGER', { error: err });
        return [];
      }
    }

    case 'HR':
    case 'HR_MANAGER':
    case 'HR_PERSONNEL':
      return findUsersByTenantRole(ctx.companyId, ['HR', 'HR_MANAGER', 'HR_PERSONNEL', 'HR Personnel', 'HR Manager']);

    case 'FINANCE':
    case 'FINANCE_MANAGER':
      return findUsersByTenantRole(ctx.companyId, ['FINANCE', 'FINANCE_MANAGER', 'Finance Manager', 'Finance Personnel']);

    case 'IT':
      return findUsersByTenantRole(ctx.companyId, ['IT', 'IT_MANAGER', 'IT Personnel']);

    case 'ADMIN':
    case 'COMPANY_ADMIN':
      return findUsersByUserRole(ctx.companyId, 'COMPANY_ADMIN');

    case 'ALL': {
      try {
        const users = await platformPrisma.user.findMany({
          where: { companyId: ctx.companyId, isActive: true },
          select: { id: true },
        });
        return users.map((u) => u.id);
      } catch (err) {
        logger.warn('Failed to resolve ALL', { error: err });
        return [];
      }
    }

    default:
      logger.warn('Unknown recipient role, returning empty set', { role });
      return [];
  }
}

async function findUsersByUserRole(companyId: string, userRole: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'USER'): Promise<string[]> {
  try {
    const users = await platformPrisma.user.findMany({
      where: { companyId, isActive: true, role: userRole },
      select: { id: true },
    });
    return users.map((u) => u.id);
  } catch (err) {
    logger.warn('Failed to resolve by user role', { error: err, userRole });
    return [];
  }
}

async function findUsersByTenantRole(companyId: string, roleNames: string[]): Promise<string[]> {
  try {
    // Find tenant users whose custom role name matches any of the provided names.
    // Tenant ids map to companies 1:1 via the multi-tenancy layer, so we filter
    // by company and then join through TenantUser → Role.
    const tenantUsers = await platformPrisma.tenantUser.findMany({
      where: {
        isActive: true,
        user: { companyId, isActive: true },
        role: { name: { in: roleNames } },
      },
      select: { userId: true },
    });
    return Array.from(new Set(tenantUsers.map((tu) => tu.userId)));
  } catch (err) {
    logger.warn('Failed to resolve tenant role', { error: err, roleNames });
    return [];
  }
}
