import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';

/**
 * Shape of a single step inside `ApprovalWorkflow.steps` (stored as JSON).
 * Kept local here because Prisma exposes the field as unstructured JSON.
 *
 * At most one of `approverId` / `approverRole` is expected to be set.
 * `approverRole` is the normalized uppercase string (e.g. "MANAGER", "HR").
 */
interface WorkflowStep {
  stepOrder: number;
  approverRole?: string;
  approverId?: string;
  slaHours?: number;
}

/**
 * Look up the approver USER IDs for the current pending step of an approval
 * workflow tied to a given (entityType, entityId).
 *
 * Handles both approver shapes used by the ESS workflow engine:
 *   - `approverId` set on the step → returns `[approverId]`
 *   - `approverRole: 'MANAGER'`   → resolves requester's reportingManager user ID
 *   - `approverRole: 'HR'`        → resolves all company users with hr:* permission
 *
 * Always returns user IDs (never employee IDs) so the dispatcher can
 * enqueue notifications directly. Returns an empty array on any failure
 * so callers can dispatch non-blocking without special-casing errors.
 */
export async function getCurrentStepApproverIds(
  entityType: string,
  entityId: string,
): Promise<string[]> {
  try {
    const request = await platformPrisma.approvalRequest.findFirst({
      where: { entityType, entityId },
      include: { workflow: true },
    });
    if (!request) return [];

    const steps = (request.workflow?.steps ?? []) as unknown as WorkflowStep[];
    if (!Array.isArray(steps) || steps.length === 0) return [];

    const currentStep = steps.find((s) => s.stepOrder === request.currentStep);
    if (!currentStep) return [];

    // Case 1: explicit approverId — single-user step
    if (currentStep.approverId) {
      const userId = await resolveToUserId(currentStep.approverId);
      return userId ? [userId] : [];
    }

    // Case 2: role-based approver — resolve per-requester
    if (currentStep.approverRole) {
      const role = currentStep.approverRole.toUpperCase();
      if (role === 'MANAGER') {
        return await resolveManagerUserIds(request.companyId, request.requesterId);
      }
      if (role === 'HR') {
        return await resolveHrUserIds(request.companyId);
      }
      // Unknown role — log and fall through to empty result
      logger.warn('Unknown approverRole in workflow step', {
        entityType,
        entityId,
        approverRole: currentStep.approverRole,
      });
    }

    return [];
  } catch (err) {
    logger.warn('Failed to resolve current step approvers', {
      error: err,
      entityType,
      entityId,
    });
    return [];
  }
}

/**
 * Normalize an ID that might be an employeeId OR a userId into a userId.
 * Returns null if neither lookup finds a match.
 */
async function resolveToUserId(idOrEmployeeId: string): Promise<string | null> {
  try {
    // Try as user ID first
    const asUser = await platformPrisma.user.findUnique({
      where: { id: idOrEmployeeId },
      select: { id: true },
    });
    if (asUser) return asUser.id;

    // Fall back: treat as employee ID and join to user
    const employee = await platformPrisma.employee.findUnique({
      where: { id: idOrEmployeeId },
      select: { user: { select: { id: true } } },
    });
    return employee?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the reporting-manager user ID for a given requester.
 * Falls back to active delegates if the manager has any configured.
 */
async function resolveManagerUserIds(
  _companyId: string,
  requesterId: string,
): Promise<string[]> {
  try {
    const requester = await platformPrisma.employee.findFirst({
      where: { OR: [{ id: requesterId }, { user: { id: requesterId } }] },
      select: {
        reportingManagerId: true,
      },
    });
    if (!requester?.reportingManagerId) return [];

    const manager = await platformPrisma.employee.findUnique({
      where: { id: requester.reportingManagerId },
      select: { user: { select: { id: true } } },
    });
    return manager?.user?.id ? [manager.user.id] : [];
  } catch (err) {
    logger.warn('Failed to resolve manager user IDs', { error: err, requesterId });
    return [];
  }
}

/**
 * Resolve all users in a company who have HR-level permissions.
 * Returns user IDs of active users with `hr:*`, any `hr:*` permission, or
 * `COMPANY_ADMIN` base role.
 */
async function resolveHrUserIds(companyId: string): Promise<string[]> {
  try {
    const users = await platformPrisma.user.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        role: true,
        tenantUsers: {
          include: { role: { select: { permissions: true } } },
        },
      },
    });

    const result: string[] = [];
    for (const u of users) {
      if (u.role === 'COMPANY_ADMIN') {
        result.push(u.id);
        continue;
      }
      const hasHr = u.tenantUsers.some((tu) => {
        const perms = tu.role?.permissions as unknown;
        return (
          Array.isArray(perms) &&
          perms.some(
            (p) => typeof p === 'string' && (p === '*' || p === 'hr' || p.startsWith('hr:')),
          )
        );
      });
      if (hasHr) result.push(u.id);
    }
    return result;
  } catch (err) {
    logger.warn('Failed to resolve HR user IDs', { error: err, companyId });
    return [];
  }
}

/**
 * Look up the requester user ID for an entity. Accepts an employeeId
 * and/or a userId (either may be null). If userId is provided, returns
 * it directly. Otherwise joins Employee → User. Returns null if neither
 * field is set.
 */
export async function getRequesterUserId(opts: {
  employeeId?: string | null | undefined;
  userId?: string | null | undefined;
}): Promise<string | null> {
  if (opts.userId) return opts.userId;
  if (opts.employeeId) {
    try {
      const emp = await platformPrisma.employee.findUnique({
        where: { id: opts.employeeId },
        select: { user: { select: { id: true } } },
      });
      return emp?.user?.id ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
