/**
 * Navigation Manifest — Single source of truth for all sidebar items.
 * Adding a new page = add one entry here. Both web + mobile auto-render it.
 */

import { hasPermission } from './permissions';

export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  requiredPerm: string | null;
  path: string;
  module: string | null;
  group: string;
  moduleSeparator?: string;
  roleScope: 'super_admin' | 'company' | 'all';
  sortOrder: number;
  children?: { label: string; path: string }[];
}

export const NAVIGATION_MANIFEST: NavigationItem[] = [
  // ═══════ OVERVIEW ═══════
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', requiredPerm: null, path: '/app/dashboard', module: null, group: 'Overview', roleScope: 'all', sortOrder: 0 },
  { id: 'notification-preferences', label: 'Notification Preferences', icon: 'bell', requiredPerm: null, path: '/app/settings/notifications', module: null, group: 'Account', roleScope: 'all', sortOrder: 9990 },

  // ═══════ SUPER ADMIN: PLATFORM ═══════
  { id: 'sa-companies', label: 'Companies', icon: 'building', requiredPerm: 'platform:admin', path: '/app/companies', module: null, group: 'Platform Management', moduleSeparator: 'Platform Management', roleScope: 'super_admin', sortOrder: 100 },
  { id: 'sa-billing', label: 'Billing', icon: 'credit-card', requiredPerm: 'platform:admin', path: '/app/billing', module: null, group: 'Platform Management', roleScope: 'super_admin', sortOrder: 101, children: [{ label: 'Overview', path: '/app/billing' }, { label: 'Invoices', path: '/app/billing/invoices' }, { label: 'Payments', path: '/app/billing/payments' }] },
  { id: 'sa-audit', label: 'Audit Log', icon: 'shield-check', requiredPerm: 'platform:admin', path: '/app/reports/audit', module: null, group: 'Platform Management', roleScope: 'super_admin', sortOrder: 102 },
  { id: 'sa-modules', label: 'Module Catalogue', icon: 'blocks', requiredPerm: 'platform:admin', path: '/app/modules', module: null, group: 'System', moduleSeparator: 'System', roleScope: 'super_admin', sortOrder: 200 },
  { id: 'sa-monitor', label: 'Platform Monitor', icon: 'activity', requiredPerm: 'platform:admin', path: '/app/monitor', module: null, group: 'System', roleScope: 'super_admin', sortOrder: 201 },
  { id: 'sa-users', label: 'User Management', icon: 'user-cog', requiredPerm: 'platform:admin', path: '/app/admin/users', module: null, group: 'System', roleScope: 'super_admin', sortOrder: 202 },
  { id: 'sa-registrations', label: 'Registrations', icon: 'user-plus', requiredPerm: 'platform:admin', path: '/app/registrations', module: null, group: 'Platform Management', roleScope: 'super_admin', sortOrder: 103 },
  { id: 'sa-support', label: 'Support Dashboard', icon: 'support', requiredPerm: 'platform:admin', path: '/app/support', module: null, group: 'System', roleScope: 'super_admin', sortOrder: 203 },

  // ═══════ SELF-SERVICE (ESS) — visible to employees, managers, and admins ═══════
  { id: 'ess-profile', label: 'My Profile', icon: 'user', requiredPerm: 'ess:view-profile', path: '/app/company/hr/my-profile', module: 'hr', group: 'My Workspace', moduleSeparator: 'Self-Service', roleScope: 'company', sortOrder: 300 },
  { id: 'ess-payslips', label: 'My Payslips', icon: 'receipt', requiredPerm: 'ess:view-payslips', path: '/app/company/hr/my-payslips', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 301 },
  { id: 'ess-leave', label: 'My Leave', icon: 'calendar-off', requiredPerm: 'ess:view-leave', path: '/app/company/hr/my-leave', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 302 },
  { id: 'ess-attendance', label: 'My Attendance', icon: 'clock', requiredPerm: 'ess:view-attendance', path: '/app/company/hr/my-attendance', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 303 },
  { id: 'ess-checkin', label: 'Shift Check-In', icon: 'log-in', requiredPerm: 'ess:view-attendance', path: '/app/company/hr/shift-check-in', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 304 },
  { id: 'ess-holidays', label: 'Holiday Calendar', icon: 'calendar', requiredPerm: 'ess:view-holidays', path: '/app/company/hr/holidays', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 305 },
  { id: 'ess-goals', label: 'My Goals', icon: 'target', requiredPerm: 'ess:view-goals', path: '/app/company/hr/my-goals', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 306 },
  { id: 'ess-it-dec', label: 'IT Declarations', icon: 'file-check', requiredPerm: 'ess:it-declaration', path: '/app/company/hr/it-declarations', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 307 },
  { id: 'ess-form16', label: 'Form 16', icon: 'file-text', requiredPerm: 'ess:download-form16', path: '/app/company/hr/my-form16', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 308 },
  { id: 'ess-grievance', label: 'Grievances', icon: 'alert-triangle', requiredPerm: 'ess:raise-grievance', path: '/app/company/hr/my-grievances', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 309 },
  { id: 'ess-training', label: 'My Training', icon: 'graduation-cap', requiredPerm: 'ess:enroll-training', path: '/app/company/hr/my-training', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 310 },
  { id: 'ess-assets', label: 'My Assets', icon: 'package', requiredPerm: 'ess:view-assets', path: '/app/company/hr/my-assets', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 311 },
  { id: 'ess-shift-swap', label: 'Shift Swap', icon: 'repeat', requiredPerm: 'ess:swap-shift', path: '/app/company/hr/shift-swap', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 312 },
  { id: 'ess-wfh', label: 'WFH Request', icon: 'home', requiredPerm: 'ess:request-wfh', path: '/app/company/hr/wfh-requests', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 313 },
  { id: 'ess-documents', label: 'My Documents', icon: 'file-up', requiredPerm: 'ess:upload-document', path: '/app/company/hr/my-documents', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 314 },
  { id: 'ess-policies', label: 'Policy Documents', icon: 'book-open', requiredPerm: 'ess:view-policies', path: '/app/company/hr/policy-documents', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 315 },
  { id: 'ess-expense-claims', label: 'My Expenses', icon: 'receipt', requiredPerm: 'ess:claim-expense', path: '/app/company/hr/my-expense-claims', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 317 },
  { id: 'ess-loans', label: 'My Loans', icon: 'banknote', requiredPerm: 'ess:apply-loan', path: '/app/company/hr/my-loans', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 318 },
  { id: 'ess-org-chart', label: 'Org Chart', icon: 'network', requiredPerm: 'ess:view-org-chart', path: '/app/company/hr/org-chart', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 319 },
  { id: 'ess-esign', label: 'E-Sign Requests', icon: 'pen-tool', requiredPerm: 'ess:view-esign', path: '/app/company/hr/esign', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 320 },
  { id: 'ess-appraisal', label: 'My Appraisal', icon: 'target', requiredPerm: 'ess:submit-appraisal', path: '/app/company/hr/my-appraisal', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 321 },
  { id: 'ess-disciplinary', label: 'Disciplinary Actions', icon: 'gavel', requiredPerm: 'ess:view-disciplinary', path: '/app/company/hr/disciplinary', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 322 },
  { id: 'ess-chatbot', label: 'AI Assistant', icon: 'message-circle', requiredPerm: 'ess:use-chatbot', path: '/app/company/hr/chatbot', module: 'hr', group: 'My Workspace', roleScope: 'company', sortOrder: 323 },
  { id: 'ess-helpdesk', label: 'Help & Support', icon: 'support', requiredPerm: null, path: '/app/help', module: null, group: 'My Workspace', roleScope: 'company', sortOrder: 399 },

  // ═══════ MANAGER SELF-SERVICE ═══════
  { id: 'mss-team', label: 'Team View', icon: 'users', requiredPerm: 'hr:approve', path: '/app/company/hr/team-view', module: 'hr', group: 'Team Management', roleScope: 'company', sortOrder: 350 },
  { id: 'mss-approvals', label: 'Approval Requests', icon: 'check-square', requiredPerm: 'hr:approve', path: '/app/company/hr/approval-requests', module: 'hr', group: 'Team Management', roleScope: 'company', sortOrder: 351 },

  // ═══════ COMPANY ADMIN ═══════
  { id: 'ca-profile', label: 'Company Profile', icon: 'building', requiredPerm: 'company:read', path: '/app/company/profile', module: null, group: 'Company', moduleSeparator: 'Company Admin', roleScope: 'company', sortOrder: 400 },
  { id: 'ca-locations', label: 'Locations', icon: 'map-pin', requiredPerm: 'company:read', path: '/app/company/locations', module: null, group: 'Company', roleScope: 'company', sortOrder: 401 },
  { id: 'ca-shifts', label: 'Shifts & Time', icon: 'clock', requiredPerm: 'company:read', path: '/app/company/shifts', module: null, group: 'Company', roleScope: 'company', sortOrder: 402 },
  { id: 'ca-contacts', label: 'Key Contacts', icon: 'users', requiredPerm: 'company:read', path: '/app/company/contacts', module: null, group: 'Company', roleScope: 'company', sortOrder: 403 },

  { id: 'ca-users', label: 'User Management', icon: 'user-cog', requiredPerm: 'user:read', path: '/app/company/users', module: null, group: 'People & Access', roleScope: 'company', sortOrder: 410 },
  { id: 'ca-roles', label: 'Roles & Permissions', icon: 'shield', requiredPerm: 'role:read', path: '/app/company/roles', module: null, group: 'People & Access', roleScope: 'company', sortOrder: 411 },

  { id: 'ca-modules', label: 'Module Catalogue', icon: 'blocks', requiredPerm: 'company:read', path: '/app/modules', module: null, group: 'Configuration', roleScope: 'company', sortOrder: 420 },
  { id: 'ca-noseries', label: 'Number Series', icon: 'hash', requiredPerm: 'company:read', path: '/app/company/no-series', module: null, group: 'Configuration', roleScope: 'company', sortOrder: 421 },
  { id: 'ca-iot', label: 'IOT Reasons', icon: 'cpu', requiredPerm: 'company:read', path: '/app/company/iot-reasons', module: null, group: 'Configuration', roleScope: 'company', sortOrder: 422 },
  { id: 'ca-controls', label: 'System Controls', icon: 'sliders', requiredPerm: 'company:configure', path: '/app/company/controls', module: null, group: 'Configuration', roleScope: 'company', sortOrder: 423 },
  { id: 'ca-settings', label: 'Settings', icon: 'settings', requiredPerm: 'company:read', path: '/app/company/settings', module: null, group: 'Configuration', roleScope: 'company', sortOrder: 424 },

  // TODO: Temporarily hidden — re-enable when billing screens are ready
  // { id: 'ca-billing', label: 'Billing Overview', icon: 'credit-card', requiredPerm: 'billing:read', path: '/app/company/billing', module: null, group: 'Billing', roleScope: 'company', sortOrder: 430 },
  // { id: 'ca-invoices', label: 'Invoices', icon: 'file-text', requiredPerm: 'billing:read', path: '/app/company/billing/invoices', module: null, group: 'Billing', roleScope: 'company', sortOrder: 431 },
  // { id: 'ca-payments', label: 'Payments', icon: 'credit-card', requiredPerm: 'billing:read', path: '/app/company/billing/payments', module: null, group: 'Billing', roleScope: 'company', sortOrder: 432 },

  // ═══════ HR ANALYTICS ═══════
  { id: 'hr-analytics', label: 'Analytics Hub', icon: 'bar-chart-2', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics', module: 'hr', group: 'HR Analytics', moduleSeparator: 'HR Analytics', roleScope: 'company', sortOrder: 450 },
  { id: 'hr-analytics-executive', label: 'Executive Overview', icon: 'layout-dashboard', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/executive', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 451 },
  { id: 'hr-analytics-workforce', label: 'Workforce Analytics', icon: 'users', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/workforce', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 452 },
  { id: 'hr-analytics-attendance', label: 'Attendance & Productivity', icon: 'clock', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/attendance', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 453 },
  { id: 'hr-analytics-leave', label: 'Leave & Availability', icon: 'calendar-off', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/leave', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 454 },
  { id: 'hr-analytics-payroll', label: 'Payroll & Cost Intelligence', icon: 'indian-rupee', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/payroll', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 455 },
  { id: 'hr-analytics-compliance', label: 'Compliance & Risk', icon: 'shield-check', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/compliance', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 456 },
  { id: 'hr-analytics-performance', label: 'Performance & Talent', icon: 'target', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/performance', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 457 },
  { id: 'hr-analytics-recruitment', label: 'Recruitment Intelligence', icon: 'user-plus', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/recruitment', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 458 },
  { id: 'hr-analytics-training', label: 'Training Intelligence', icon: 'graduation-cap', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/training', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 459 },
  { id: 'hr-analytics-attrition', label: 'Attrition & Retention', icon: 'user-minus', requiredPerm: 'analytics:read', path: '/app/company/hr/analytics/attrition', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 460 },
  { id: 'hr-analytics-reports', label: 'Reports & Downloads', icon: 'file-spreadsheet', requiredPerm: 'analytics:export', path: '/app/company/hr/analytics/reports', module: 'hr', group: 'HR Analytics', roleScope: 'company', sortOrder: 461 },

  // ═══════ HRMS ═══════
  { id: 'hr-departments', label: 'Departments', icon: 'building', requiredPerm: 'hr:read', path: '/app/company/hr/departments', module: 'hr', group: 'Org Structure', moduleSeparator: 'HRMS', roleScope: 'company', sortOrder: 500 },
  { id: 'hr-designations', label: 'Designations', icon: 'briefcase', requiredPerm: 'hr:read', path: '/app/company/hr/designations', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 501 },
  { id: 'hr-grades', label: 'Grades & Bands', icon: 'bar-chart', requiredPerm: 'hr:read', path: '/app/company/hr/grades', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 502 },
  { id: 'hr-emptypes', label: 'Employee Types', icon: 'user-check', requiredPerm: 'hr:read', path: '/app/company/hr/employee-types', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 503 },
  { id: 'hr-costcentres', label: 'Cost Centres', icon: 'wallet', requiredPerm: 'hr:read', path: '/app/company/hr/cost-centres', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 504 },
  { id: 'hr-employees', label: 'Employee Directory', icon: 'users', requiredPerm: 'hr:read', path: '/app/company/hr/employees', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 505 },
  { id: 'hr-orgchart', label: 'Org Chart', icon: 'git-fork', requiredPerm: 'hr:read', path: '/app/company/hr/org-chart', module: 'hr', group: 'Org Structure', roleScope: 'company', sortOrder: 506 },

  { id: 'hr-att-admin', label: 'Mark Attendance', icon: 'user-check', requiredPerm: 'attendance:mark', path: '/app/company/hr/admin-attendance', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 509 },
  { id: 'hr-att-dash', label: 'Attendance Dashboard', icon: 'calendar-check', requiredPerm: 'hr:read', path: '/app/company/hr/attendance', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 510 },
  { id: 'hr-holidays', label: 'Holiday Calendar', icon: 'calendar', requiredPerm: 'hr:read', path: '/app/company/hr/holidays', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 511 },
  { id: 'hr-rosters', label: 'Rosters', icon: 'calendar-days', requiredPerm: 'hr:read', path: '/app/company/hr/rosters', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 512 },
  { id: 'hr-att-overrides', label: 'Attendance Overrides', icon: 'clipboard-check', requiredPerm: 'hr:read', path: '/app/company/hr/attendance-overrides', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 512.5 },
  { id: 'hr-att-rules', label: 'Attendance Rules', icon: 'clipboard-list', requiredPerm: 'hr:configure', path: '/app/company/hr/attendance-rules', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 513 },
  { id: 'hr-ot-rules', label: 'Overtime Rules', icon: 'timer', requiredPerm: 'hr:configure', path: '/app/company/hr/overtime-rules', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 514 },
  { id: 'hr-biometric', label: 'Biometric Devices', icon: 'cpu', requiredPerm: 'hr:configure', path: '/app/company/hr/biometric-devices', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 515 },
  { id: 'hr-rotations', label: 'Shift Rotations', icon: 'refresh-cw', requiredPerm: 'hr:configure', path: '/app/company/hr/shift-rotations', module: 'hr', group: 'Attendance', roleScope: 'company', sortOrder: 516 },

  { id: 'hr-leave-types', label: 'Leave Types', icon: 'file-text', requiredPerm: 'hr:read', path: '/app/company/hr/leave-types', module: 'hr', group: 'Leave Management', roleScope: 'company', sortOrder: 520 },
  { id: 'hr-leave-pol', label: 'Leave Policies', icon: 'book-open', requiredPerm: 'hr:read', path: '/app/company/hr/leave-policies', module: 'hr', group: 'Leave Management', roleScope: 'company', sortOrder: 521 },
  { id: 'hr-leave-req', label: 'Leave Requests', icon: 'send', requiredPerm: 'hr:read', path: '/app/company/hr/leave-requests', module: 'hr', group: 'Leave Management', roleScope: 'company', sortOrder: 522 },
  { id: 'hr-leave-bal', label: 'Leave Balances', icon: 'scale', requiredPerm: 'hr:read', path: '/app/company/hr/leave-balances', module: 'hr', group: 'Leave Management', roleScope: 'company', sortOrder: 523 },

  { id: 'hr-sal-comp', label: 'Salary Components', icon: 'dollar-sign', requiredPerm: 'hr:read', path: '/app/company/hr/salary-components', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 530 },
  { id: 'hr-sal-struct', label: 'Salary Structures', icon: 'file-spreadsheet', requiredPerm: 'hr:read', path: '/app/company/hr/salary-structures', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 531 },
  { id: 'hr-emp-sal', label: 'Employee Salary', icon: 'credit-card', requiredPerm: 'hr:read', path: '/app/company/hr/employee-salary', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 532 },
  { id: 'hr-statutory', label: 'Statutory Config', icon: 'shield', requiredPerm: 'hr:configure', path: '/app/company/hr/statutory-config', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 533 },
  { id: 'hr-tax', label: 'Tax & TDS', icon: 'calculator', requiredPerm: 'hr:configure', path: '/app/company/hr/tax-config', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 534 },
  { id: 'hr-bank', label: 'Bank Config', icon: 'landmark', requiredPerm: 'hr:configure', path: '/app/company/hr/bank-config', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 535 },
  { id: 'hr-loan-pol', label: 'Loan Policies', icon: 'hand-coins', requiredPerm: 'hr:read', path: '/app/company/hr/loan-policies', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 536 },
  { id: 'hr-loans', label: 'Loans', icon: 'receipt', requiredPerm: 'hr:read', path: '/app/company/hr/loans', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 537 },

  { id: 'hr-it-declarations', label: 'IT Declarations', icon: 'file-check', requiredPerm: 'hr:read', path: '/app/company/hr/it-declarations', module: 'hr', group: 'Payroll & Compliance', roleScope: 'company', sortOrder: 538 },

  { id: 'hr-payroll-runs', label: 'Payroll Runs', icon: 'play', requiredPerm: 'hr:read', path: '/app/company/hr/payroll-runs', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 540 },
  { id: 'hr-payslips', label: 'Payslips', icon: 'file-text', requiredPerm: 'hr:read', path: '/app/company/hr/payslips', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 541 },
  { id: 'hr-sal-holds', label: 'Salary Holds', icon: 'pause-circle', requiredPerm: 'hr:read', path: '/app/company/hr/salary-holds', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 542 },
  { id: 'hr-sal-rev', label: 'Salary Revisions', icon: 'trending-up', requiredPerm: 'hr:read', path: '/app/company/hr/salary-revisions', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 543 },
  { id: 'hr-stat-fil', label: 'Statutory Filings', icon: 'stamp', requiredPerm: 'hr:read', path: '/app/company/hr/statutory-filings', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 544 },
  { id: 'hr-pay-reports', label: 'Payroll Reports', icon: 'bar-chart', requiredPerm: 'hr:export', path: '/app/company/hr/payroll-reports', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 545 },
  { id: 'hr-bonus', label: 'Bonus Batches', icon: 'gift', requiredPerm: 'hr:read', path: '/app/company/hr/bonus-batches', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 546 },
  { id: 'hr-form16', label: 'Form 16 & 24Q', icon: 'file-text', requiredPerm: 'hr:read', path: '/app/company/hr/form-16', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 547 },
  { id: 'hr-travel', label: 'Travel Advances', icon: 'plane', requiredPerm: 'hr:read', path: '/app/company/hr/travel-advances', module: 'hr', group: 'Payroll Operations', roleScope: 'company', sortOrder: 548 },

  { id: 'hr-ess-config', label: 'ESS Config', icon: 'settings', requiredPerm: 'hr:configure', path: '/app/company/hr/ess-config', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 550 },
  { id: 'hr-workflows', label: 'Approval Workflows', icon: 'git-branch', requiredPerm: 'hr:configure', path: '/app/company/hr/approval-workflows', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 551 },
  { id: 'hr-notif-tpl', label: 'Notification Templates', icon: 'mail', requiredPerm: 'hr:configure', path: '/app/company/hr/notification-templates', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 552 },
  { id: 'hr-notif-rules', label: 'Notification Rules', icon: 'bell-ring', requiredPerm: 'hr:configure', path: '/app/company/hr/notification-rules', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 553 },
  { id: 'hr-notif-analytics', label: 'Notification Analytics', icon: 'bar-chart-2', requiredPerm: 'hr:configure', path: '/app/company/hr/notification-analytics', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 554 },
  { id: 'hr-announcements', label: 'Send Announcement', icon: 'megaphone', requiredPerm: 'hr:configure', path: '/app/company/hr/announcements', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 555 },
  { id: 'hr-esign', label: 'E-Sign Tracking', icon: 'pen-tool', requiredPerm: 'hr:read', path: '/app/company/hr/esign', module: 'hr', group: 'ESS & Workflows', roleScope: 'company', sortOrder: 556 },

  { id: 'hr-transfers', label: 'Employee Transfers', icon: 'arrow-left-right', requiredPerm: 'hr:read', path: '/app/company/hr/transfers', module: 'hr', group: 'Transfers & Promotions', roleScope: 'company', sortOrder: 560 },
  { id: 'hr-promotions', label: 'Employee Promotions', icon: 'trending-up', requiredPerm: 'hr:read', path: '/app/company/hr/promotions', module: 'hr', group: 'Transfers & Promotions', roleScope: 'company', sortOrder: 561 },
  { id: 'hr-delegates', label: 'Manager Delegation', icon: 'user-check', requiredPerm: 'hr:read', path: '/app/company/hr/delegates', module: 'hr', group: 'Transfers & Promotions', roleScope: 'company', sortOrder: 562 },

  { id: 'hr-appraisals', label: 'Appraisal Cycles', icon: 'target', requiredPerm: 'hr:read', path: '/app/company/hr/appraisal-cycles', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 570 },
  { id: 'hr-goals', label: 'Goals & OKRs', icon: 'flag', requiredPerm: 'hr:read', path: '/app/company/hr/goals', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 571 },
  { id: 'hr-360', label: '360 Feedback', icon: 'message-square', requiredPerm: 'hr:read', path: '/app/company/hr/feedback-360', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 572 },
  { id: 'hr-ratings', label: 'Ratings & Calibration', icon: 'star', requiredPerm: 'hr:read', path: '/app/company/hr/ratings', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 573 },
  { id: 'hr-skills', label: 'Skills & Mapping', icon: 'brain', requiredPerm: 'hr:read', path: '/app/company/hr/skills', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 574 },
  { id: 'hr-succession', label: 'Succession Planning', icon: 'git-fork', requiredPerm: 'hr:read', path: '/app/company/hr/succession', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 575 },
  { id: 'hr-perf-dash', label: 'Performance Dashboard', icon: 'activity', requiredPerm: 'hr:read', path: '/app/company/hr/performance-dashboard', module: 'hr', group: 'Performance', roleScope: 'company', sortOrder: 576 },

  { id: 'hr-requisitions', label: 'Job Requisitions', icon: 'briefcase', requiredPerm: 'hr:read', path: '/app/company/hr/requisitions', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 580 },
  { id: 'hr-candidates', label: 'Candidates', icon: 'user-plus', requiredPerm: 'hr:read', path: '/app/company/hr/candidates', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 581 },
  { id: 'hr-offers', label: 'Offers', icon: 'file-text', requiredPerm: 'hr:read', path: '/app/company/hr/requisitions', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 582 },
  { id: 'hr-training', label: 'Training Catalogue', icon: 'graduation-cap', requiredPerm: 'hr:read', path: '/app/company/hr/training', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 583 },
  { id: 'hr-training-sessions', label: 'Training Sessions', icon: 'calendar', requiredPerm: 'hr:read', path: '/app/company/hr/training', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 584 },
  { id: 'hr-trainers', label: 'Trainers', icon: 'user-check', requiredPerm: 'hr:read', path: '/app/company/hr/training', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 585 },
  { id: 'hr-training-programs', label: 'Training Programs', icon: 'layers', requiredPerm: 'hr:read', path: '/app/company/hr/training', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 586 },
  { id: 'hr-training-budgets', label: 'Training Budgets', icon: 'wallet', requiredPerm: 'hr:read', path: '/app/company/hr/training', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 587 },
  { id: 'hr-nominations', label: 'Training Nominations', icon: 'award', requiredPerm: 'hr:read', path: '/app/company/hr/training-nominations', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 588 },
  { id: 'hr-onboarding', label: 'Onboarding', icon: 'log-in', requiredPerm: 'hr:read', path: '/app/company/hr/onboarding', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 589 },
  { id: 'hr-probation', label: 'Probation Reviews', icon: 'clock', requiredPerm: 'hr:read', path: '/app/company/hr/probation-reviews', module: 'hr', group: 'Recruitment & Training', roleScope: 'company', sortOrder: 590 },

  { id: 'hr-exit', label: 'Exit Requests', icon: 'log-out', requiredPerm: 'hr:read', path: '/app/company/hr/exit-requests', module: 'hr', group: 'Exit & Separation', roleScope: 'company', sortOrder: 595 },
  { id: 'hr-clearance', label: 'Clearance Dashboard', icon: 'clipboard-list', requiredPerm: 'hr:read', path: '/app/company/hr/clearance-dashboard', module: 'hr', group: 'Exit & Separation', roleScope: 'company', sortOrder: 596 },
  { id: 'hr-fnf', label: 'F&F Settlement', icon: 'calculator', requiredPerm: 'hr:read', path: '/app/company/hr/fnf-settlement', module: 'hr', group: 'Exit & Separation', roleScope: 'company', sortOrder: 597 },

  { id: 'hr-assets', label: 'Asset Management', icon: 'package', requiredPerm: 'hr:read', path: '/app/company/hr/assets', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 600 },
  { id: 'hr-expenses', label: 'Expense Claims', icon: 'receipt', requiredPerm: 'hr:read', path: '/app/company/hr/expenses', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 601 },
  { id: 'hr-letters', label: 'HR Letters', icon: 'file-signature', requiredPerm: 'hr:read', path: '/app/company/hr/hr-letters', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 602 },
  { id: 'hr-grievances', label: 'Grievances', icon: 'alert-triangle', requiredPerm: 'hr:read', path: '/app/company/hr/grievances', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 603 },
  { id: 'hr-disciplinary', label: 'Disciplinary Actions', icon: 'gavel', requiredPerm: 'hr:read', path: '/app/company/hr/disciplinary', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 604 },
  { id: 'hr-chatbot', label: 'HR Chatbot', icon: 'message-circle', requiredPerm: 'hr:read', path: '/app/company/hr/chatbot', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 605 },
  { id: 'hr-retention', label: 'Data Retention', icon: 'database', requiredPerm: 'hr:configure', path: '/app/company/hr/data-retention', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 606 },
  { id: 'hr-incentives', label: 'Production Incentives', icon: 'trending-up', requiredPerm: 'hr:read', path: '/app/company/hr/production-incentives', module: 'hr', group: 'Advanced HR', roleScope: 'company', sortOrder: 607 },

  // ═══════ OPERATIONS ═══════
  { id: 'ops-inventory', label: 'Inventory', icon: 'package', requiredPerm: 'inventory:read', path: '/app/inventory', module: 'inventory', group: 'Operations', moduleSeparator: 'Operations', roleScope: 'company', sortOrder: 700 },
  { id: 'ops-production', label: 'Production', icon: 'factory', requiredPerm: 'production:read', path: '/app/production', module: 'production', group: 'Operations', roleScope: 'company', sortOrder: 701 },
  { id: 'ops-maintenance', label: 'Maintenance', icon: 'wrench', requiredPerm: 'maintenance:read', path: '/app/maintenance', module: 'machine-maintenance', group: 'Operations', roleScope: 'company', sortOrder: 702, children: [{ label: 'Work Orders', path: '/app/maintenance/orders' }, { label: 'Machine Registry', path: '/app/maintenance/machines' }] },

  // ═══════ REPORTS ═══════
  { id: 'rpt-audit', label: 'Audit Logs', icon: 'shield-check', requiredPerm: 'audit:read', path: '/app/reports/audit', module: null, group: 'Reports', roleScope: 'company', sortOrder: 800 },
];

/**
 * Group navigation items by their group name, preserving sort order.
 */
export function getGroupedNavigation(items: NavigationItem[]): Array<{
  group: string;
  moduleSeparator?: string;
  items: NavigationItem[];
}> {
  const groups = new Map<string, { moduleSeparator: string | undefined; items: NavigationItem[] }>();
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const collapsed = collapseChildPaths(sorted);

  for (const item of collapsed) {
    if (!groups.has(item.group)) {
      groups.set(item.group, { moduleSeparator: item.moduleSeparator, items: [] });
    }
    groups.get(item.group)!.items.push(item);
  }

  return Array.from(groups.entries()).map(([group, data]) => {
    const result: { group: string; moduleSeparator?: string; items: NavigationItem[] } = { group, items: data.items };
    if (data.moduleSeparator) result.moduleSeparator = data.moduleSeparator;
    return result;
  });
}

function collapseChildPaths(items: NavigationItem[]): NavigationItem[] {
  const consumed = new Set<string>();
  const result: NavigationItem[] = [];

  for (const item of items) {
    if (consumed.has(item.id)) continue;

    // Keep explicitly configured children as-is.
    if (item.children && item.children.length > 0) {
      result.push(item);
      continue;
    }

    const childCandidates = items.filter((candidate) => {
      if (candidate.id === item.id) return false;
      if (consumed.has(candidate.id)) return false;
      if (candidate.group !== item.group) return false;
      if (!candidate.path.startsWith(`${item.path}/`)) return false;
      return true;
    });

    if (childCandidates.length === 0) {
      result.push(item);
      continue;
    }

    const children = [
      { label: 'Overview', path: item.path },
      ...childCandidates
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((candidate) => ({ label: candidate.label, path: candidate.path })),
    ];

    childCandidates.forEach((candidate) => consumed.add(candidate.id));
    result.push({ ...item, children });
  }

  return result;
}
