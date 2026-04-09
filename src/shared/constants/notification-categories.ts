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
];

export function getCategoryDef(code: string): NotificationCategoryDef | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.code === code);
}

export function isCategoryLocked(code: string): boolean {
  return getCategoryDef(code)?.locked === true;
}

// TODO(I5 — phase 2): expose `NOTIFICATION_CATEGORIES` via a public API
// (e.g. `GET /notifications/categories`) so the web/mobile preference UIs can
// render the matrix dynamically instead of hard-coding the list. Include
// `locked` in the payload so the UI can disable the toggle for AUTH.
