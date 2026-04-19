/**
 * Policy Resolver Service
 *
 * Core engine that resolves the effective attendance policy for a given context
 * by walking the 7-layer configuration stack. Every overridable field follows
 * a typed resolution chain:
 *
 *   Policy fields  : shift -> attendanceRules -> SYSTEM_DEFAULTS
 *   Constraint fields: location -> shift -> attendanceRules -> SYSTEM_DEFAULTS
 *
 * The resolver records a field-level trace (which layer provided each value)
 * and stores it alongside the resolved policy for audit purposes.
 *
 * Failure strategy: If resolution completely fails (DB down, no cache), throw a
 * descriptive ApiError. Do NOT silently return defaults — an attendance record
 * must never be created with incorrect data.
 */

import type { CompanyShift, Location, AttendanceRule, ShiftBreak } from '@prisma/client';
import { ApiError } from '../errors';
import { logger } from '../../config/logger';
import { SYSTEM_DEFAULTS } from '../constants/system-defaults';
import {
  getCachedShift,
  getCachedLocation,
  getCachedAttendanceRules,
  getCachedShiftBreaks,
} from '../utils/config-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedPolicy {
  gracePeriodMinutes: number;
  earlyExitToleranceMinutes: number;
  halfDayThresholdHours: number;
  fullDayThresholdHours: number;
  maxLateCheckInMinutes: number;
  selfieRequired: boolean;
  gpsRequired: boolean;
  punchMode: string; // PunchMode enum value
  workingHoursRounding: string; // RoundingStrategy enum value
  geofenceEnforcementMode: string; // 'OFF' | 'WARN' | 'STRICT'
  breakDeductionMinutes: number;
}

export type ResolutionSource = 'SHIFT' | 'LOCATION' | 'ATTENDANCE_RULE' | 'SYSTEM_DEFAULT';

export interface ResolutionTrace {
  [field: string]: ResolutionSource;
}

export interface EvaluationContext {
  employeeId: string;
  shiftId: string | null;
  locationId: string | null;
  date: Date;
  isHoliday: boolean;
  isWeekOff: boolean;
  holidayName?: string;
  rosterPattern?: string;
}

export interface PolicyResolutionResult {
  policy: ResolvedPolicy;
  trace: ResolutionTrace;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

interface SourceCandidate<T> {
  value: T | null | undefined;
  label: ResolutionSource;
}

/**
 * Walk an ordered list of source candidates and return the first non-null/undefined
 * value. Records which layer provided the value in the trace object.
 *
 * Throws if NO source provides a value — this is a programming error (SYSTEM_DEFAULTS
 * should always be present as the last candidate).
 */
function resolve<T>(
  field: string,
  trace: ResolutionTrace,
  ...sources: SourceCandidate<T>[]
): T {
  for (const source of sources) {
    if (source.value !== null && source.value !== undefined) {
      trace[field] = source.label;
      return source.value;
    }
  }
  // Should never reach here — SYSTEM_DEFAULTS must always provide a terminal value.
  throw new Error(`Policy resolution exhausted all sources for field "${field}" without finding a value`);
}

/**
 * Safely convert a Prisma Decimal field to a number.
 * Returns null if the input is null or undefined so the resolution chain can skip it.
 */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve the effective attendance policy for a given company + context.
 *
 * @param companyId - The company to resolve policy for
 * @param context   - Evaluation context (employee, shift, location, date, flags)
 * @returns Resolved policy and field-level resolution trace
 * @throws ApiError if critical data cannot be loaded
 */
export async function resolvePolicy(
  companyId: string,
  context: EvaluationContext,
): Promise<PolicyResolutionResult> {
  let shift: CompanyShift | null = null;
  let location: Location | null = null;
  let rules: AttendanceRule;
  let breaks: ShiftBreak[] = [];

  try {
    // Parallel fetch of all config layers
    const [shiftResult, locationResult, rulesResult] = await Promise.all([
      context.shiftId ? getCachedShift(context.shiftId) : Promise.resolve(null),
      context.locationId ? getCachedLocation(context.locationId) : Promise.resolve(null),
      getCachedAttendanceRules(companyId),
    ]);

    shift = shiftResult;
    location = locationResult;
    rules = rulesResult;

    // Fetch shift breaks if a shift is present
    if (shift) {
      breaks = await getCachedShiftBreaks(shift.id);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `Policy resolution failed: could not load configuration layers [company=${companyId}, shift=${context.shiftId}, location=${context.locationId}]: ${message}`,
    );
    throw ApiError.internal(
      `Failed to resolve attendance policy for company ${companyId}: ${message}`,
    );
  }

  const trace: ResolutionTrace = {};

  // ── Policy Fields: shift -> attendanceRules -> SYSTEM_DEFAULTS ──

  const policy: ResolvedPolicy = {
    gracePeriodMinutes: resolve('gracePeriod', trace,
      { value: shift?.gracePeriodMinutes ?? null, label: 'SHIFT' },
      { value: rules.gracePeriodMinutes, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.gracePeriodMinutes, label: 'SYSTEM_DEFAULT' },
    ),

    earlyExitToleranceMinutes: resolve('earlyExitTolerance', trace,
      { value: shift?.earlyExitToleranceMinutes ?? null, label: 'SHIFT' },
      { value: rules.earlyExitToleranceMinutes, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.earlyExitToleranceMinutes, label: 'SYSTEM_DEFAULT' },
    ),

    halfDayThresholdHours: resolve('halfDayThreshold', trace,
      { value: decimalToNumber(shift?.halfDayThresholdHours), label: 'SHIFT' },
      { value: decimalToNumber(rules.halfDayThresholdHours), label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.halfDayThresholdHours, label: 'SYSTEM_DEFAULT' },
    ),

    fullDayThresholdHours: resolve('fullDayThreshold', trace,
      { value: decimalToNumber(shift?.fullDayThresholdHours), label: 'SHIFT' },
      { value: decimalToNumber(rules.fullDayThresholdHours), label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.fullDayThresholdHours, label: 'SYSTEM_DEFAULT' },
    ),

    maxLateCheckInMinutes: resolve('maxLateCheckIn', trace,
      { value: shift?.maxLateCheckInMinutes ?? null, label: 'SHIFT' },
      { value: rules.maxLateCheckInMinutes, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.maxLateCheckInMinutes, label: 'SYSTEM_DEFAULT' },
    ),

    // ── Constraint Fields: location -> shift -> attendanceRules -> SYSTEM_DEFAULTS ──

    selfieRequired: resolve('selfieRequired', trace,
      { value: location?.requireSelfie ?? null, label: 'LOCATION' },
      { value: shift?.requireSelfie ?? null, label: 'SHIFT' },
      { value: rules.selfieRequired, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.selfieRequired, label: 'SYSTEM_DEFAULT' },
    ),

    gpsRequired: resolve('gpsRequired', trace,
      { value: location?.requireLiveLocation ?? null, label: 'LOCATION' },
      { value: shift?.requireGPS ?? null, label: 'SHIFT' },
      { value: rules.gpsRequired, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.gpsRequired, label: 'SYSTEM_DEFAULT' },
    ),

    // ── Punch & Rounding: attendanceRules -> SYSTEM_DEFAULTS ──

    punchMode: resolve('punchMode', trace,
      { value: rules.punchMode, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.punchMode, label: 'SYSTEM_DEFAULT' },
    ),

    workingHoursRounding: resolve('workingHoursRounding', trace,
      { value: rules.workingHoursRounding, label: 'ATTENDANCE_RULE' },
      { value: SYSTEM_DEFAULTS.workingHoursRounding, label: 'SYSTEM_DEFAULT' },
    ),

    geofenceEnforcementMode: resolve('geofenceEnforcementMode', trace,
      { value: rules.geofenceEnforcementMode, label: 'ATTENDANCE_RULE' },
      { value: 'OFF' as const, label: 'SYSTEM_DEFAULT' },
    ),

    // Break deduction is calculated below
    breakDeductionMinutes: 0,
  };

  // ── Break Deduction: sum unpaid break durations from ShiftBreak records ──

  if (shift && breaks.length > 0) {
    policy.breakDeductionMinutes = breaks
      .filter((b) => !b.isPaid)
      .reduce((sum, b) => sum + b.duration, 0);
    trace.breakDeduction = 'SHIFT';
  } else {
    policy.breakDeductionMinutes = SYSTEM_DEFAULTS.breakDeductionMinutes;
    trace.breakDeduction = 'SYSTEM_DEFAULT';
  }

  logger.info(
    `Policy resolved for attendance [company=${companyId}, shift=${context.shiftId}] trace=${JSON.stringify(trace)}`,
  );

  return { policy, trace };
}
