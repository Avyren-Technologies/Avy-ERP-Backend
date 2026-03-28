import { z } from 'zod';

// ── Attendance Records ────────────────────────────────────────────────

export const createAttendanceSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  date: z.string().min(1, 'Date is required'), // ISO date string
  shiftId: z.string().optional(),
  punchIn: z.string().optional(), // ISO datetime
  punchOut: z.string().optional(), // ISO datetime
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'LOP']),
  source: z.enum(['BIOMETRIC', 'FACE_RECOGNITION', 'MOBILE_GPS', 'WEB_PORTAL', 'MANUAL', 'IOT', 'SMART_CARD']),
  remarks: z.string().optional(),
  locationId: z.string().optional(),
});

export const updateAttendanceSchema = createAttendanceSchema.partial();

// ── Attendance Rules ──────────────────────────────────────────────────

export const attendanceRulesSchema = z.object({
  dayBoundaryTime: z.string().optional(),
  halfDayThresholdHours: z.number().min(0).max(24).optional(),
  fullDayThresholdHours: z.number().min(0).max(24).optional(),
  lateArrivalsAllowed: z.number().int().min(0).optional(),
  gracePeriodMinutes: z.number().int().min(0).optional(),
  earlyExitMinutes: z.number().int().min(0).optional(),
  lopAutoDeduct: z.boolean().optional(),
  missingPunchAlert: z.boolean().optional(),
  selfieRequired: z.boolean().optional(),
  gpsRequired: z.boolean().optional(),
});

// ── Overrides / Regularization ────────────────────────────────────────

export const createOverrideSchema = z.object({
  attendanceRecordId: z.string().min(1, 'Attendance record ID is required'),
  issueType: z.enum([
    'MISSING_PUNCH_IN',
    'MISSING_PUNCH_OUT',
    'ABSENT_OVERRIDE',
    'LATE_OVERRIDE',
    'NO_PUNCH',
  ]),
  correctedPunchIn: z.string().optional(),
  correctedPunchOut: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
});

export const approveOverrideSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

// ── Holiday Calendar ──────────────────────────────────────────────────

export const createHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().min(1, 'Date is required'), // ISO date string
  type: z.enum(['NATIONAL', 'REGIONAL', 'COMPANY', 'OPTIONAL', 'RESTRICTED']),
  branchIds: z.array(z.string()).optional(),
  year: z.number().int().min(2000).max(2100),
  description: z.string().optional(),
  isOptional: z.boolean().optional(),
  maxOptionalSlots: z.number().int().positive().optional(),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export const cloneHolidaysSchema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  toYear: z.number().int().min(2000).max(2100),
});

// ── Rosters ───────────────────────────────────────────────────────────

export const createRosterSchema = z.object({
  name: z.string().min(1).max(100),
  pattern: z.enum(['MON_FRI', 'MON_SAT', 'MON_SAT_ALT', 'CUSTOM']),
  weekOff1: z.string().optional(),
  weekOff2: z.string().optional(),
  applicableTypeIds: z.array(z.string()).optional(),
  effectiveFrom: z.string().min(1, 'Effective date is required'), // ISO date
  isDefault: z.boolean().optional(),
});

export const updateRosterSchema = createRosterSchema.partial();

// ── Populate Month ───────────────────────────────────────────────────

export const populateMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
});

// ── Overtime Rules ────────────────────────────────────────────────────

export const overtimeRulesSchema = z.object({
  eligibleTypeIds: z.array(z.string()).optional(),
  rateMultiplier: z.number().min(0.1).max(10),
  thresholdMinutes: z.number().int().min(0).optional(),
  monthlyCap: z.number().min(0).optional(),
  weeklyCap: z.number().min(0).optional(),
  autoIncludePayroll: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
});
