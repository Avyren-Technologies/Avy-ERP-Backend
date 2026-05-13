import type { DashboardFilters, DataScope } from '../../../analytics.types';

// ─── Report Mode (auto-detected from date range) ───

export type ReportMode = 'daily' | 'weekly' | 'monthly' | 'multi-month';

export function detectReportMode(dateFrom: string, dateTo: string): ReportMode {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (days <= 1) return 'daily';
  if (days <= 14) return 'weekly';
  if (days <= 62) return 'monthly';
  return 'multi-month';
}

// ─── Attendance Half ───

export interface HalfInfo {
  half: 'FIRST_HALF' | 'SECOND_HALF';
  status: string;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
}

// ─── Flattened Attendance Record (from DB query) ───

export interface FlatRecord {
  id: string;
  employeeId: string;
  date: Date;
  dateStr: string;
  dayOfWeek: string;
  status: string;
  source: string;
  shiftSequence: number;
  punchIn: Date | null;
  punchOut: Date | null;
  workedHours: number;
  overtimeHours: number;
  isLate: boolean;
  lateMinutes: number;
  isEarlyExit: boolean;
  earlyMinutes: number;
  appliedBreakDeductionMinutes: number;
  appliedLateDeduction: number;
  appliedEarlyExitDeduction: number;
  geoStatus: string | null;
  isRegularized: boolean;
  finalStatusReason: string | null;
  remarks: string | null;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  resolutionTrace: Record<string, unknown> | null;
  evaluationContext: Record<string, unknown> | null;
  updatedAt: Date;
  // Employee info (flattened)
  empCode: string;
  empName: string;
  department: string;
  designation: string;
  location: string;
  reportingManager: string;
  employeeType: string;
  joiningDate: Date | null;
  fatherMotherName: string | null;
  // Shift info
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  shiftIsCrossDay: boolean;
  shiftType: string;
  // Halves
  halves: HalfInfo[];
}

// ─── Employee Monthly Summary (computed in one pass) ───

export interface EmployeeSummary {
  employeeId: string;
  empCode: string;
  empName: string;
  department: string;
  designation: string;
  location: string;
  reportingManager: string;
  employeeType: string;
  joiningDate: Date | null;
  fatherMotherName: string | null;
  shiftName: string;
  // Counts
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  lateDays: number;
  earlyExitDays: number;
  holidayDays: number;
  weekOffDays: number;
  lopDays: number;
  incompleteDays: number;
  regularizedDays: number;
  // Hours
  totalWorkedHours: number;
  totalOTHours: number;
  // Deductions
  totalLateDeduction: number;
  totalEarlyExitDeduction: number;
  // Payroll
  paidDays: number;
  holidayWorkedDays: number;
  weekOffWorkedDays: number;
  nightShiftDays: number;
  // Leave breakdown by type code
  leaveByType: Record<string, number>;
  // Paid leave vs unpaid leave
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

// ─── Exception Entry ───

export type ExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExceptionEntry {
  severity: ExceptionSeverity;
  category: string;
  type: string;
  date: string;
  empCode: string;
  empName: string;
  department: string;
  details: string;
  currentStatus: string;
  resolution: string;
}

// ─── Override Info ───

export interface OverrideInfo {
  id: string;
  attendanceRecordId: string;
  employeeId: string;
  issueType: string;
  status: string;
  correctedPunchIn: Date | null;
  correctedPunchOut: Date | null;
  reason: string;
}

// ─── Audit Entry ───

export interface AuditEntry {
  changedAt: Date;
  attendanceDate: string;
  empCode: string;
  empName: string;
  department: string;
  action: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  changedByName: string;
  payrollImpacted: boolean;
}

// ─── Holiday Info ───

export interface HolidayInfo {
  date: string;
  name: string;
  type: string;
}

// ─── Department Breakdown ───

export interface DeptBreakdown {
  department: string;
  employees: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  halfDay: number;
  otHours: number;
  workedHours: number;
  total: number;
  attendancePct: number;
}

// ─── Shift Breakdown ───

export interface ShiftBreakdown {
  shiftName: string;
  shiftTiming: string;
  shiftType: string;
  isCrossDay: boolean;
  assignedEmployees: number;
  totalRecords: number;
  avgWorkedHours: number;
  lateCount: number;
  latePct: number;
  otHoursTotal: number;
  avgOTHours: number;
  attendancePct: number;
}

// ─── Leave Balance Info ───

export interface LeaveBalanceInfo {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  category: string;
  annualEntitlement: number;
  balance: number;
  taken: number;
  accrued: number;
}

// ─── The complete pre-indexed dataset ───

export interface ReportDataset {
  // Raw records
  records: FlatRecord[];
  // Pre-built indexes
  byEmployee: Map<string, FlatRecord[]>;
  byDate: Map<string, FlatRecord[]>;
  byEmployeeDate: Map<string, FlatRecord[]>;
  employees: Map<string, FlatRecord>;
  // Pre-computed per-employee summaries
  employeeSummaries: Map<string, EmployeeSummary>;
  // Aggregated KPIs
  statusCounts: Record<string, number>;
  deptBreakdown: DeptBreakdown[];
  shiftBreakdown: ShiftBreakdown[];
  // Reference data
  overrides: OverrideInfo[];
  holidays: Map<string, HolidayInfo>;
  holidayList: HolidayInfo[];
  leaveBalances: Map<string, LeaveBalanceInfo[]>;
  pendingLeaveRequests: Map<string, Record<string, number>>;
  roster: { name: string; pattern: string; weekOff1: string | null; weekOff2: string | null } | null;
  attendanceRules: Record<string, unknown>;
  overtimeRules: Record<string, unknown> | null;
  payrollRun: { id: string; status: string; lockedBy: string | null; lockedAt: Date | null; month: number; year: number } | null;
  /** All payroll runs in the date range, keyed by "YYYY-MM" (e.g., "2026-05"). For multi-month reports. */
  payrollRunsByMonth: Map<string, { id: string; status: string; lockedBy: string | null; lockedAt: Date | null; month: number; year: number }>;
  auditEntries: AuditEntry[];
  // Metadata
  companyName: string;
  companyTimezone: string;
  totalEmployees: number;
  filteredEmployees: number;
  filters: DashboardFilters;
  scope: DataScope;
  mode: ReportMode;
  generatedAt: Date;
  generatedBy: string;
  dayCount: number;
  dateRange: { from: Date; to: Date };
  allDates: string[];
  weekendDates: Set<string>;
  holidayDates: Set<string>;
}

// ─── Status code mapping ───

export const STATUS_CODES: Record<string, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  HALF_DAY: 'HD',
  LATE: 'L',
  EARLY_EXIT: 'EE',
  INCOMPLETE: 'MP',
  ON_LEAVE: 'LV',
  HOLIDAY: 'H',
  WEEK_OFF: 'W',
  REGULARIZED: 'R',
  LOP: 'LOP',
};

export const STATUS_LEGEND = 'P=Present  A=Absent  HD=Half Day  L=Late  EE=Early Exit  MP=Missing Punch  LV=Leave  H=Holiday  W=Week Off  R=Regularized  LOP=Loss of Pay  CL/SL/PL/CO=Leave Type';

export const SOURCE_LABELS: Record<string, string> = {
  BIOMETRIC: 'Biometric',
  FACE_RECOGNITION: 'Face ID',
  MOBILE_GPS: 'Mobile',
  WEB_PORTAL: 'Web',
  MANUAL: 'Manual',
  IOT: 'IoT',
  SMART_CARD: 'Smart Card',
  HR_BOOK: 'HR Book',
};

export const GEO_LABELS: Record<string, string> = {
  INSIDE_GEOFENCE: 'Inside',
  OUTSIDE_GEOFENCE: 'Outside',
  NO_LOCATION: 'N/A',
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
