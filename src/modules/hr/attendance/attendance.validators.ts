import { z } from 'zod';
import {
  PunchMode,
  RoundingStrategy,
  PunchRounding,
  RoundingDirection,
  DeductionType,
  OTCalculationBasis,
  OvertimeRequestStatus,
  LocationAccuracy,
  GeofenceEnforcementMode,
  AttendanceMode,
  LeaveCheckInMode,
  ShiftMappingStrategy,
  CheckInUIMode,
} from '@prisma/client';

const coerceOptionalInt = () => z.coerce.number().int().min(0).optional();
const coerceOptionalNumberInRange = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).optional();
const coerceOptionalNullableNumber = (min = 0) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().min(min).nullable().optional(),
  );

/** Prisma Decimal serializes as string in JSON — accept number | numeric string */
const jsonDecimal = (val: unknown): unknown => {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : val;
  }
  return val;
};

const otMultiplierField = () =>
  z.preprocess(jsonDecimal, z.number().min(0.01).max(10).optional());

const otMultiplierNullableField = () =>
  z.preprocess(jsonDecimal, z.union([z.number().min(0.01).max(10), z.null()]).optional());

const otCapHoursNullableField = () =>
  z.preprocess(jsonDecimal, z.union([z.number().min(0), z.null()]).optional());

// ── Attendance Records ────────────────────────────────────────────────

export const createAttendanceSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  date: z.string().min(1, 'Date is required'), // ISO date string
  shiftId: z.string().optional(),
  punchIn: z.string().optional(), // ISO datetime
  punchOut: z.string().optional(), // ISO datetime
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'EARLY_EXIT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'LOP', 'REGULARIZED']),
  source: z.enum(['BIOMETRIC', 'FACE_RECOGNITION', 'MOBILE_GPS', 'WEB_PORTAL', 'MANUAL', 'IOT', 'SMART_CARD']),
  remarks: z.string().optional(),
  locationId: z.string().optional(),
});

export const updateAttendanceSchema = createAttendanceSchema.partial();

// ── Attendance Rules (26 fields — spec Screen 3) ─────────────────────

export const attendanceRulesSchema = z.object({
  // Time & Boundary
  dayBoundaryTime: z.string().optional(),

  // Grace & Tolerance
  gracePeriodMinutes: coerceOptionalInt(),
  earlyExitToleranceMinutes: coerceOptionalInt(),
  maxLateCheckInMinutes: coerceOptionalInt(),

  // Day Classification Thresholds
  halfDayThresholdHours: coerceOptionalNumberInRange(0, 24),
  fullDayThresholdHours: coerceOptionalNumberInRange(0, 24),

  // Late Tracking
  lateArrivalsAllowedPerMonth: coerceOptionalInt(),

  // Deduction Rules
  lopAutoDeduct: z.boolean().optional(),
  lateDeductionType: z.nativeEnum(DeductionType).optional(),
  lateDeductionValue: coerceOptionalNullableNumber(0),
  earlyExitDeductionType: z.nativeEnum(DeductionType).optional(),
  earlyExitDeductionValue: coerceOptionalNullableNumber(0),

  // Punch Interpretation
  punchMode: z.nativeEnum(PunchMode).optional(),

  // Auto-Processing
  autoMarkAbsentIfNoPunch: z.boolean().optional(),
  autoHalfDayEnabled: z.boolean().optional(),
  autoAbsentAfterDays: coerceOptionalInt(),
  regularizationWindowDays: coerceOptionalInt(),

  // Rounding Rules
  workingHoursRounding: z.nativeEnum(RoundingStrategy).optional(),
  punchTimeRounding: z.nativeEnum(PunchRounding).optional(),
  punchTimeRoundingDirection: z.nativeEnum(RoundingDirection).optional(),

  // Exception Handling
  ignoreLateOnLeaveDay: z.boolean().optional(),
  ignoreLateOnHoliday: z.boolean().optional(),
  ignoreLateOnWeekOff: z.boolean().optional(),

  // Capture Requirements
  selfieRequired: z.boolean().optional(),
  gpsRequired: z.boolean().optional(),
  geofenceEnforcementMode: z.nativeEnum(GeofenceEnforcementMode).optional(),
  missingPunchAlert: z.boolean().optional(),

  // Check-In UI Mode
  checkInUIMode: z.nativeEnum(CheckInUIMode).optional(),

  // Attendance Mode & Flexibility
  attendanceMode: z.nativeEnum(AttendanceMode).optional(), // SHIFT_STRICT | SHIFT_RELAXED | FULLY_FLEXIBLE | EMPLOYEE_CHOICE
  leaveCheckInMode: z.nativeEnum(LeaveCheckInMode).optional(),
  leaveAutoAdjustmentEnabled: z.boolean().optional(),

  // Multiple Shifts Per Day
  multipleShiftsPerDayEnabled: z.boolean().optional(),
  minGapBetweenShiftsMinutes: coerceOptionalNullableNumber(0),
  maxShiftsPerDay: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(2).max(10).nullable().optional(),
  ),

  // Auto Shift Mapping
  autoShiftMappingEnabled: z.boolean().optional(),
  shiftMappingStrategy: z.nativeEnum(ShiftMappingStrategy).optional(),
  minShiftMatchPercentage: coerceOptionalNumberInRange(0, 100),

  // Weekly Review
  weeklyReviewEnabled: z.boolean().optional(),
  weeklyReviewRemindersEnabled: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // lateDeductionValue required when lateDeductionType != NONE
  if (data.lateDeductionType && data.lateDeductionType !== 'NONE' && (data.lateDeductionValue === undefined || data.lateDeductionValue === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lateDeductionValue is required when lateDeductionType is not NONE',
      path: ['lateDeductionValue'],
    });
  }
  // earlyExitDeductionValue required when earlyExitDeductionType != NONE
  if (data.earlyExitDeductionType && data.earlyExitDeductionType !== 'NONE' && (data.earlyExitDeductionValue === undefined || data.earlyExitDeductionValue === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'earlyExitDeductionValue is required when earlyExitDeductionType is not NONE',
      path: ['earlyExitDeductionValue'],
    });
  }
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
  weekOff1: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
  weekOff2: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
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

// ── Comp-Off Accrual ─────────────────────────────────────────────────

export const processCompOffSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
});

// ── Biometric Devices ────────────────────────────────────────────────

export const createDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  brand: z.string().min(1),
  deviceId: z.string().min(1),
  ipAddress: z.string().optional(),
  port: z.number().int().optional(),
  syncMode: z.enum(['PUSH', 'PULL', 'MANUAL']).optional(),
  syncIntervalMin: z.number().int().min(1).optional(),
  locationId: z.string().optional(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const syncDeviceSchema = z.object({
  records: z.array(z.object({
    employeeId: z.string().min(1),
    date: z.string().min(1),
    punchIn: z.string().optional(),
    punchOut: z.string().optional(),
  })).min(1),
});

// ── Shift Rotation ───────────────────────────────────────────────────

export const createRotationScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  rotationPattern: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'CUSTOM']),
  shifts: z.array(z.object({
    shiftId: z.string().min(1),
    weekNumber: z.number().int().min(1),
  })).min(2, 'At least 2 shifts required for rotation'),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
});

export const updateRotationScheduleSchema = createRotationScheduleSchema.partial();

export const assignRotationSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
});

// ── Overtime Rules (20 fields — spec Screen 5) ──────────────────────

export const overtimeRulesSchema = z.object({
  // Eligibility
  eligibleTypeIds: z.array(z.string()).nullable().optional(), // null = all eligible

  // Calculation Basis
  calculationBasis: z.nativeEnum(OTCalculationBasis).optional(),
  thresholdMinutes: z.preprocess(jsonDecimal, z.number().int().min(0).optional()),
  minimumOtMinutes: z.preprocess(jsonDecimal, z.number().int().min(0).optional()),
  includeBreaksInOT: z.boolean().optional(),

  // Rate Multipliers
  weekdayMultiplier: otMultiplierField(),
  weekendMultiplier: otMultiplierNullableField(),
  holidayMultiplier: otMultiplierNullableField(),
  nightShiftMultiplier: otMultiplierNullableField(),

  // Caps
  dailyCapHours: otCapHoursNullableField(),
  weeklyCapHours: otCapHoursNullableField(),
  monthlyCapHours: otCapHoursNullableField(),
  enforceCaps: z.boolean().optional(),
  maxContinuousOtHours: otCapHoursNullableField(),

  // Approval & Payroll
  approvalRequired: z.boolean().optional(),
  autoIncludePayroll: z.boolean().optional(),

  // Comp-Off
  compOffEnabled: z.boolean().optional(),
  compOffExpiryDays: z.preprocess(
    jsonDecimal,
    z.union([z.number().int().min(1), z.null()]).optional(),
  ),

  // Rounding
  roundingStrategy: z.nativeEnum(RoundingStrategy).optional(),
});

// ── OT Request Approval / Rejection ──────────────────────────────────

export const approveOvertimeRequestSchema = z.object({
  approvalNotes: z.string().optional(),
});

export const rejectOvertimeRequestSchema = z.object({
  approvalNotes: z.string().min(1, 'Rejection reason is required'),
});

// ── Weekly Review ────────────────────────────────────────────────────

export const weeklyReviewQuerySchema = z.object({
  weekStart: z.string().min(1, 'Week start date is required'),
  weekEnd: z.string().min(1, 'Week end date is required'),
  departmentId: z.string().optional(),
  flag: z.enum(['MISSING_PUNCH', 'AUTO_MAPPED', 'WORKED_ON_LEAVE', 'LATE_BEYOND_THRESHOLD', 'MULTIPLE_SHIFT_ANOMALY', 'OT_ANOMALY']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const remapShiftSchema = z.object({
  shiftId: z.string().min(1, 'Shift ID is required'),
});

export const editPunchesSchema = z.object({
  punchIn: z.string().optional(),
  punchOut: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
});

export const markReviewedSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1, 'At least one record ID is required'),
});
