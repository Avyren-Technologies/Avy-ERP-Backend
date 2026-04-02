// ══════════════════════════════════════════════════════════════════════
// APPROVER ROLES — Single source of truth for workflow approver types
// ══════════════════════════════════════════════════════════════════════
//
// Every ApprovalWorkflowStep has an `approverRole` field that determines
// who is responsible for approving that step. The workflow engine
// resolves the actual approver based on this role.
//
// HOW TO ADD A NEW APPROVER ROLE:
// 1. Add an entry to APPROVER_ROLES below with value, label,
//    and description.
// 2. That's it — the frontend dropdown auto-populates from the
//    GET /hr/ess/approval-workflow-config endpoint.
// ══════════════════════════════════════════════════════════════════════

export interface ApproverRoleOption {
  /** Exact value stored in DB (UPPER_SNAKE_CASE) */
  value: string;
  /** Human-readable label for UI */
  label: string;
  /** Brief explanation shown as helper text */
  description: string;
}

/**
 * All valid approver role values.
 *
 * The `value` field is what gets stored in the DB and matched by
 * the workflow engine. Keep values stable — renaming requires a
 * data migration.
 */
export const APPROVER_ROLES: readonly ApproverRoleOption[] = [
  {
    value: 'MANAGER',
    label: 'Reporting Manager',
    description: 'Direct reporting manager of the employee',
  },
  {
    value: 'DEPARTMENT_HEAD',
    label: 'Department Head',
    description: 'Head of the employee\'s department',
  },
  {
    value: 'HR',
    label: 'HR Manager',
    description: 'Human Resources manager or personnel with HR permissions',
  },
  {
    value: 'FINANCE',
    label: 'Finance Manager',
    description: 'Finance department manager or personnel with finance permissions',
  },
  {
    value: 'CEO',
    label: 'CEO / Director',
    description: 'Chief Executive Officer or company director',
  },
] as const;

/** Set of all valid approverRole values — used for fast validation */
export const VALID_APPROVER_ROLE_VALUES = new Set(
  APPROVER_ROLES.map((r) => r.value),
);

/**
 * Check whether a string is a valid approver role value.
 * Used by validators and the service layer.
 */
export function isValidApproverRole(value: string): boolean {
  return VALID_APPROVER_ROLE_VALUES.has(value);
}
