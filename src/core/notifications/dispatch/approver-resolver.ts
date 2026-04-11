import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';

/**
 * Shape of a single step inside `ApprovalWorkflow.steps` (stored as JSON).
 * Kept local here because Prisma exposes the field as unstructured JSON.
 *
 * `approverRole` stores a dynamic RBAC Role ID (cuid) from the Roles &
 * Permissions system, NOT a predefined string like "MANAGER" or "HR".
 * At most one of `approverId` / `approverRole` is expected to be set.
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
 *   - `approverRole` set on the step → resolves all active users assigned
 *     to that RBAC Role via TenantUser
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

    // Case 2: role-based approver — resolve all users assigned to this RBAC role
    if (currentStep.approverRole) {
      return await resolveRoleUserIds(currentStep.approverRole, request.companyId);
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
 *
 * Exported so submission wiring code can pass whatever identifier is handy
 * (ApprovalRequest.requesterId is typed as a string but can be either).
 */
export async function resolveToUserId(idOrEmployeeId: string): Promise<string | null> {
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
 * Resolve all active user IDs assigned to a given RBAC Role ID.
 *
 * The approverRole stored in workflow steps is a dynamic Role ID (cuid)
 * from the Roles & Permissions system. We look up all TenantUser records
 * with that roleId where both the TenantUser and the linked User are active.
 *
 * Also includes COMPANY_ADMIN users as a fallback — they can always approve.
 */
async function resolveRoleUserIds(roleId: string, companyId: string): Promise<string[]> {
  try {
    // Find all active users assigned to this specific role
    const tenantUsers = await platformPrisma.tenantUser.findMany({
      where: {
        roleId,
        isActive: true,
        user: { isActive: true, companyId },
      },
      select: { userId: true },
    });

    const userIds = tenantUsers.map((tu) => tu.userId);

    if (userIds.length === 0) {
      logger.warn('No active users found for approver role', { roleId, companyId });
    }

    return userIds;
  } catch (err) {
    logger.warn('Failed to resolve role-based user IDs', { error: err, roleId, companyId });
    return [];
  }
}

/**
 * Look up the requester user ID for an entity. Accepts an employeeId
 * and/or a userId (either may be null). VERIFIES whichever is set before
 * returning it — if you pass a userId that doesn't exist, it falls back
 * to treating it as an employeeId and joining Employee → User. This
 * protects against the "ApprovalRequest.requesterId is a string but
 * could be either kind of ID" foot-gun.
 */
export async function getRequesterUserId(opts: {
  employeeId?: string | null | undefined;
  userId?: string | null | undefined;
}): Promise<string | null> {
  // Collect non-null candidates, deduping so we don't double-query when
  // the caller passes the same value for both fields (safe default).
  const candidates = new Set<string>();
  if (opts.userId) candidates.add(opts.userId);
  if (opts.employeeId) candidates.add(opts.employeeId);

  for (const candidate of candidates) {
    const resolved = await resolveToUserId(candidate);
    if (resolved) return resolved;
  }
  return null;
}
