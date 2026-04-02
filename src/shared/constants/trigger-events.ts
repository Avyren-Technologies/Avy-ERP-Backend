// ══════════════════════════════════════════════════════════════════════
// TRIGGER EVENTS — Single source of truth for approval workflow triggers
// ══════════════════════════════════════════════════════════════════════
//
// Every ApprovalWorkflow record has a `triggerEvent` field that ties it
// to a specific business action. The workflow engine matches on this
// value to find the right approval chain at runtime.
//
// HOW TO ADD A NEW TRIGGER EVENT:
// 1. Add an entry to TRIGGER_EVENTS below with value, label, module,
//    and description.
// 2. That's it — the frontend dropdown auto-populates from the
//    GET /hr/ess/approval-workflow-config endpoint.
// ══════════════════════════════════════════════════════════════════════

export interface TriggerEventOption {
  /** Exact value stored in DB (UPPER_SNAKE_CASE) */
  value: string;
  /** Human-readable label for UI */
  label: string;
  /** Module grouping for UI */
  module: string;
  /** Brief explanation shown as helper text */
  description: string;
}

/**
 * All valid trigger event values.
 *
 * The `value` field is what gets stored in the DB and matched by
 * the workflow engine. Keep values stable — renaming requires a
 * data migration.
 */
export const TRIGGER_EVENTS: readonly TriggerEventOption[] = [
  // ── ESS ──────────────────────────────────────────────────────────────
  {
    value: 'LEAVE_APPLICATION',
    label: 'Leave Application',
    module: 'ESS',
    description: 'Triggered when an employee applies for leave',
  },
  {
    value: 'ATTENDANCE_REGULARIZATION',
    label: 'Attendance Regularization',
    module: 'ESS',
    description: 'Triggered when an employee requests attendance correction',
  },
  {
    value: 'OVERTIME_CLAIM',
    label: 'Overtime Claim',
    module: 'ESS',
    description: 'Triggered when an employee claims overtime hours',
  },
  {
    value: 'SHIFT_CHANGE',
    label: 'Shift Change',
    module: 'ESS',
    description: 'Triggered when an employee requests a shift swap or change',
  },
  {
    value: 'PROFILE_UPDATE',
    label: 'Profile Update',
    module: 'ESS',
    description: 'Triggered when an employee updates their profile details',
  },
  {
    value: 'WFH_REQUEST',
    label: 'Work From Home Request',
    module: 'ESS',
    description: 'Triggered when an employee requests to work from home',
  },

  // ── Financial ────────────────────────────────────────────────────────
  {
    value: 'REIMBURSEMENT',
    label: 'Expense Reimbursement',
    module: 'Financial',
    description: 'Triggered when an employee submits an expense claim',
  },
  {
    value: 'LOAN_APPLICATION',
    label: 'Loan Application',
    module: 'Financial',
    description: 'Triggered when an employee applies for a salary advance or loan',
  },
  {
    value: 'IT_DECLARATION',
    label: 'IT Declaration',
    module: 'Financial',
    description: 'Triggered when an employee submits income tax declarations',
  },
  {
    value: 'TRAVEL_REQUEST',
    label: 'Travel Request',
    module: 'Financial',
    description: 'Triggered when an employee requests travel approval',
  },

  // ── HR ───────────────────────────────────────────────────────────────
  {
    value: 'RESIGNATION',
    label: 'Resignation',
    module: 'HR',
    description: 'Triggered when an employee submits resignation',
  },
  {
    value: 'EMPLOYEE_TRANSFER',
    label: 'Employee Transfer',
    module: 'HR',
    description: 'Triggered when an employee transfer is initiated',
  },
  {
    value: 'EMPLOYEE_PROMOTION',
    label: 'Employee Promotion',
    module: 'HR',
    description: 'Triggered when an employee promotion is initiated',
  },
  {
    value: 'SALARY_REVISION',
    label: 'Salary Revision',
    module: 'HR',
    description: 'Triggered when a salary revision is proposed',
  },
  {
    value: 'JOB_REQUISITION',
    label: 'Job Requisition',
    module: 'HR',
    description: 'Triggered when a new job requisition is raised',
  },

  // ── Payroll ──────────────────────────────────────────────────────────
  {
    value: 'PAYROLL_APPROVAL',
    label: 'Payroll Approval',
    module: 'Payroll',
    description: 'Triggered when payroll run is submitted for approval',
  },
  {
    value: 'BONUS_UPLOAD',
    label: 'Bonus Upload',
    module: 'Payroll',
    description: 'Triggered when bonus data is uploaded for processing',
  },

  // ── Assets ───────────────────────────────────────────────────────────
  {
    value: 'ASSET_ISSUANCE',
    label: 'Asset Issuance',
    module: 'Assets',
    description: 'Triggered when a company asset is assigned to an employee',
  },

  // ── Training ─────────────────────────────────────────────────────────
  {
    value: 'TRAINING_REQUEST',
    label: 'Training Request',
    module: 'Training',
    description: 'Triggered when a training nomination is submitted',
  },
] as const;

/** Set of all valid triggerEvent values — used for fast validation */
export const VALID_TRIGGER_EVENT_VALUES = new Set(
  TRIGGER_EVENTS.map((t) => t.value),
);

/**
 * Check whether a string is a valid trigger event value.
 * Used by validators and the service layer.
 */
export function isValidTriggerEvent(value: string): boolean {
  return VALID_TRIGGER_EVENT_VALUES.has(value);
}
