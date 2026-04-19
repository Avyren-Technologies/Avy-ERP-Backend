/**
 * Notification category catalogue — the user-visible taxonomy for
 * per-category preference overrides. Each rule in `NotificationRule` is
 * tagged with a `category` from this list, and users can mute specific
 * (category × channel) combinations via `UserNotificationCategoryPreference`.
 *
 * The AUTH category is LOCKED — users cannot opt out of security-critical
 * notifications. The consent-gate enforces this at runtime and the preferences
 * API rejects PATCH requests that try to modify locked categories.
 */

export interface NotificationCategoryDef {
  code: string;
  label: string;
  description: string;
  /** If true, users cannot override via UserNotificationCategoryPreference (e.g. AUTH). */
  locked?: boolean;
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryDef[] = [
  { code: 'LEAVE', label: 'Leave', description: 'Leave requests, approvals, balance reminders' },
  { code: 'ATTENDANCE', label: 'Attendance', description: 'Regularization, missed punches' },
  { code: 'OVERTIME', label: 'Overtime', description: 'Overtime claims and approvals' },
  { code: 'REIMBURSEMENT', label: 'Reimbursement', description: 'Expense claims and approvals' },
  { code: 'LOAN', label: 'Loan', description: 'Loan applications and approvals' },
  { code: 'PAYROLL', label: 'Payroll', description: 'Payslips, salary credits, bonus payments' },
  { code: 'SHIFT', label: 'Shift', description: 'Shift change, swap requests' },
  { code: 'WFH', label: 'Work From Home', description: 'WFH requests' },
  { code: 'RESIGNATION', label: 'Resignation & Offboarding', description: 'Exit requests, F&F' },
  {
    code: 'EMPLOYEE_LIFECYCLE',
    label: 'Employee Lifecycle',
    description: 'Onboarding, transfers, promotions, salary revisions',
  },
  {
    code: 'RECRUITMENT',
    label: 'Recruitment',
    description: 'Interview scheduling, candidate updates, offers',
  },
  {
    code: 'TRAINING',
    label: 'Training',
    description: 'Training nominations, certificates, session reminders',
  },
  { code: 'ASSETS', label: 'Assets', description: 'Asset assignments and return reminders' },
  { code: 'SUPPORT', label: 'Support', description: 'Support ticket updates' },
  {
    code: 'PERFORMANCE',
    label: 'Performance',
    description: 'Appraisal cycles, ratings, feedback, reviews',
  },
  {
    code: 'BILLING',
    label: 'Billing & Subscription',
    description: 'Billing changes, subscription lifecycle, invoice alerts',
    locked: true,
  },
  {
    code: 'AUTH',
    label: 'Security',
    description: 'Password reset, new device login, account lock',
    locked: true,
  },
  {
    code: 'ANNOUNCEMENTS',
    label: 'Announcements',
    description: 'Company announcements and policy updates',
  },
  {
    code: 'BIRTHDAY_ANNIVERSARY',
    label: 'Celebrations',
    description: 'Birthday wishes and work anniversaries',
  },
  {
    code: 'VISITOR_MANAGEMENT',
    label: 'Visitor Management',
    description: 'Visitor pre-registration, check-in/out, approvals, emergency alerts',
  },
];

export function getCategoryDef(code: string): NotificationCategoryDef | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.code === code);
}

export function isCategoryLocked(code: string): boolean {
  return getCategoryDef(code)?.locked === true;
}

/**
 * Map from trigger-event UPPER_SNAKE_CASE to the category code used in
 * `NOTIFICATION_CATEGORIES`. Lets dispatch call sites pass the trigger
 * event they already have and get back the correct category for
 * per-category preference filtering.
 *
 * Keep in sync whenever a new trigger event is added. Unknown events
 * fall through to the raw trigger-event string so the dispatcher always
 * sets a non-null `type` on the Notification row.
 */
export const TRIGGER_TO_CATEGORY: Record<string, string> = {
  // Leave
  LEAVE_APPLICATION: 'LEAVE',
  LEAVE_APPROVED: 'LEAVE',
  LEAVE_REJECTED: 'LEAVE',
  LEAVE_CANCELLED: 'LEAVE',

  // Attendance
  ATTENDANCE_REGULARIZATION: 'ATTENDANCE',
  ATTENDANCE_REGULARIZED: 'ATTENDANCE',
  ATTENDANCE_REGULARIZATION_REJECTED: 'ATTENDANCE',
  GEOFENCE_VIOLATION: 'ATTENDANCE',
  MISSING_PUNCH_ALERT: 'ATTENDANCE',

  // Overtime
  OVERTIME_CLAIM: 'OVERTIME',
  OVERTIME_CLAIM_APPROVED: 'OVERTIME',
  OVERTIME_CLAIM_REJECTED: 'OVERTIME',
  OVERTIME_AUTO_DETECTED: 'OVERTIME',
  COMP_OFF_GRANTED: 'OVERTIME',
  COMP_OFF_EXPIRED: 'OVERTIME',

  // Shift
  SHIFT_CHANGE: 'SHIFT',
  SHIFT_SWAP: 'SHIFT',
  SHIFT_SWAP_APPROVED: 'SHIFT',
  SHIFT_SWAP_REJECTED: 'SHIFT',

  // Work from home
  WFH_REQUEST: 'WFH',
  WFH_APPROVED: 'WFH',
  WFH_REJECTED: 'WFH',

  // Reimbursement
  REIMBURSEMENT: 'REIMBURSEMENT',
  REIMBURSEMENT_APPROVED: 'REIMBURSEMENT',
  REIMBURSEMENT_REJECTED: 'REIMBURSEMENT',
  EXPENSE_CLAIM_APPROVED: 'REIMBURSEMENT',
  EXPENSE_CLAIM_REJECTED: 'REIMBURSEMENT',
  EXPENSE_CLAIM_PARTIALLY_APPROVED: 'REIMBURSEMENT',

  // Loan
  LOAN_APPLICATION: 'LOAN',
  LOAN_APPROVED: 'LOAN',
  LOAN_REJECTED: 'LOAN',
  LOAN_DISBURSED: 'LOAN',
  LOAN_CLOSED: 'LOAN',
  TRAVEL_ADVANCE_SETTLED: 'LOAN',

  // Payroll
  PAYROLL_APPROVAL: 'PAYROLL',
  PAYROLL_APPROVED: 'PAYROLL',
  PAYROLL_REJECTED: 'PAYROLL',
  PAYSLIP_PUBLISHED: 'PAYROLL',
  SALARY_CREDITED: 'PAYROLL',
  SALARY_REVISION: 'PAYROLL',
  SALARY_REVISION_APPROVED: 'PAYROLL',
  SALARY_REVISION_REJECTED: 'PAYROLL',
  BONUS_UPLOAD: 'PAYROLL',

  // Resignation / offboarding
  RESIGNATION: 'RESIGNATION',
  RESIGNATION_ACCEPTED: 'RESIGNATION',
  RESIGNATION_REJECTED: 'RESIGNATION',
  FNF_INITIATED: 'RESIGNATION',
  FNF_COMPLETED: 'RESIGNATION',

  // Employee lifecycle
  EMPLOYEE_ONBOARDED: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_TRANSFER: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_TRANSFER_APPLIED: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_TRANSFER_REJECTED: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_PROMOTION: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_PROMOTION_APPLIED: 'EMPLOYEE_LIFECYCLE',
  EMPLOYEE_PROMOTION_REJECTED: 'EMPLOYEE_LIFECYCLE',
  PROBATION_END_REMINDER: 'EMPLOYEE_LIFECYCLE',

  // Recruitment
  CANDIDATE_STAGE_CHANGED: 'RECRUITMENT',
  OFFER_SENT: 'RECRUITMENT',
  OFFER_ACCEPTED: 'RECRUITMENT',
  OFFER_REJECTED: 'RECRUITMENT',
  INTERVIEW_SCHEDULED: 'RECRUITMENT',
  INTERVIEW_COMPLETED: 'RECRUITMENT',
  JOB_REQUISITION: 'RECRUITMENT',

  // Training
  TRAINING_REQUEST: 'TRAINING',
  TRAINING_NOMINATION: 'TRAINING',
  TRAINING_COMPLETED: 'TRAINING',
  TRAINING_SESSION_UPCOMING: 'TRAINING',
  CERTIFICATE_EXPIRING: 'TRAINING',

  // Assets
  ASSET_ISSUANCE: 'ASSETS',
  ASSET_ASSIGNED: 'ASSETS',
  ASSET_RETURNED: 'ASSETS',
  ASSET_RETURN_DUE: 'ASSETS',

  // Other ESS
  PROFILE_UPDATE: 'EMPLOYEE_LIFECYCLE',
  IT_DECLARATION: 'PAYROLL',
  TRAVEL_REQUEST: 'REIMBURSEMENT',
  HELPDESK_SUBMITTED: 'SUPPORT',
  GRIEVANCE_SUBMITTED: 'SUPPORT',

  // Support
  TICKET_CREATED: 'SUPPORT',
  TICKET_MESSAGE: 'SUPPORT',
  TICKET_STATUS_CHANGED: 'SUPPORT',
  MODULE_CHANGE_APPROVED: 'SUPPORT',

  // Auth — locked category
  PASSWORD_RESET: 'AUTH',
  NEW_DEVICE_LOGIN: 'AUTH',
  ACCOUNT_LOCKED: 'AUTH',
  USER_ROLE_CHANGED: 'AUTH',
  USER_DEACTIVATED: 'AUTH',
  USER_REACTIVATED: 'AUTH',

  // Performance
  APPRAISAL_CYCLE_ACTIVATED: 'PERFORMANCE',
  APPRAISAL_RATINGS_PUBLISHED: 'PERFORMANCE',

  // Billing — locked category
  BILLING_TYPE_CHANGED: 'BILLING',
  SUBSCRIPTION_CANCELLED: 'BILLING',

  // Celebrations
  BIRTHDAY: 'BIRTHDAY_ANNIVERSARY',
  WORK_ANNIVERSARY: 'BIRTHDAY_ANNIVERSARY',

  // Announcements
  HOLIDAY_REMINDER: 'ANNOUNCEMENTS',
  ANNOUNCEMENT: 'ANNOUNCEMENTS',

  // Visitor Management
  VMS_PRE_REGISTRATION_CREATED: 'VISITOR_MANAGEMENT',
  VMS_VISITOR_CHECKED_IN: 'VISITOR_MANAGEMENT',
  VMS_VISITOR_CHECKED_OUT: 'VISITOR_MANAGEMENT',
  VMS_HOST_APPROVAL_REQUEST: 'VISITOR_MANAGEMENT',
  VMS_EMERGENCY_EVACUATION: 'VISITOR_MANAGEMENT',
  VMS_OVERSTAY_ALERT: 'VISITOR_MANAGEMENT',
  VMS_PASS_EXPIRY: 'VISITOR_MANAGEMENT',
  VMS_BLOCKLIST_ALERT: 'VISITOR_MANAGEMENT',
};

/**
 * Resolve a trigger event to its notification category code. Returns the
 * raw trigger event if no mapping exists so the dispatcher always sets
 * a non-null `type` on the Notification row.
 */
export function categoryForTrigger(triggerEvent: string): string {
  return TRIGGER_TO_CATEGORY[triggerEvent] ?? triggerEvent;
}

// TODO(I5 — phase 2): expose `NOTIFICATION_CATEGORIES` via a public API
// (e.g. `GET /notifications/categories`) so the web/mobile preference UIs can
// render the matrix dynamically instead of hard-coding the list. Include
// `locked` in the payload so the UI can disable the toggle for AUTH.
