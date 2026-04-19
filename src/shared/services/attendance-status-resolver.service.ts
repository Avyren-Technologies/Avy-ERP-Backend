/**
 * Attendance Status Resolver
 *
 * The MOST CRITICAL service in the attendance system. Deterministic, pure-function
 * engine that produces a final attendance status from:
 *   - Resolved policy (from policy-resolver)
 *   - Punch data (punchIn / punchOut)
 *   - Shift info (start/end/crossDay)
 *   - Evaluation context (holiday, weekoff, leave flags)
 *   - Attendance rules (deduction settings, exception handling)
 *
 * This function has NO side effects — no DB reads, no cache access, no mutations.
 * All inputs must be provided by the caller. This makes it fully testable and auditable.
 *
 * Logic flow (12 steps, per design spec Section 7):
 *   1.  No punch -> HOLIDAY / WEEK_OFF / ABSENT
 *   2.  Missing punch-out -> INCOMPLETE
 *   3.  Calculate raw worked minutes
 *   4.  Deduct unpaid breaks -> net worked minutes
 *   5.  Apply rounding -> net worked hours
 *   6.  Determine late arrival (compare to shift start + grace)
 *   7.  Auto-absent if delay > maxLateCheckInMinutes
 *   8.  Apply exception handling (suppress late on holiday/weekoff/leave)
 *   9.  Determine early exit
 *   10. Classify: PRESENT / LATE / HALF_DAY / EARLY_EXIT / LOP
 *   11. Calculate OT hours
 *   12. Calculate deductions
 *
 * Per design spec Section 7 and Appendix B.
 */

import { DateTime } from 'luxon';
import { logger } from '../../config/logger';
import { parseInCompanyTimezone } from '../utils/timezone';
import type { ResolvedPolicy, EvaluationContext } from './policy-resolver.service';
import { validatePunchSequence } from './punch-validator.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShiftInfo {
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  isCrossDay: boolean;
}

export interface AttendanceRulesInput {
  lopAutoDeduct: boolean;
  autoMarkAbsentIfNoPunch: boolean;
  autoHalfDayEnabled: boolean;
  lateDeductionType: string;   // DeductionType enum value
  lateDeductionValue: number | null;
  earlyExitDeductionType: string;   // DeductionType enum value
  earlyExitDeductionValue: number | null;
  ignoreLateOnLeaveDay: boolean;
  ignoreLateOnHoliday: boolean;
  ignoreLateOnWeekOff: boolean;
}

export interface StatusResult {
  status: string; // AttendanceStatus enum value
  finalStatusReason: string;
  isLate: boolean;
  lateMinutes: number;
  isEarlyExit: boolean;
  earlyMinutes: number;
  workedHours: number;
  overtimeHours: number;
  appliedLateDeduction: number | null;
  appliedEarlyExitDeduction: number | null;
}

// ─── Rounding Helpers ───────────────────────────────────────────────────────

/**
 * Apply rounding strategy to a raw hours value.
 * Rounding strategies per the RoundingStrategy enum.
 */
function applyRounding(rawHours: number, strategy: string): number {
  switch (strategy) {
    case 'NEAREST_15':
      return Math.round(rawHours * 4) / 4;
    case 'NEAREST_30':
      return Math.round(rawHours * 2) / 2;
    case 'FLOOR_15':
      return Math.floor(rawHours * 4) / 4;
    case 'CEIL_15':
      return Math.ceil(rawHours * 4) / 4;
    case 'NONE':
    default:
      // Round to 2 decimal places to avoid floating point drift
      return Math.round(rawHours * 100) / 100;
  }
}

// ─── Shift Time Parsing ─────────────────────────────────────────────────────

/**
 * Parse shift start/end into Luxon DateTimes in the company timezone.
 * For cross-day shifts, the end time is on the next calendar day.
 *
 * @param dateStr          - Attendance date in yyyy-MM-dd format
 * @param shift            - Shift info with start/end times and cross-day flag
 * @param companyTimezone  - IANA timezone string
 * @returns Parsed shift start and end as DateTime objects
 */
function parseShiftTimes(
  dateStr: string,
  shift: ShiftInfo,
  companyTimezone: string,
): { shiftStart: DateTime; shiftEnd: DateTime } {
  const shiftStart = parseInCompanyTimezone(dateStr, shift.startTime, companyTimezone);
  let shiftEnd = parseInCompanyTimezone(dateStr, shift.endTime, companyTimezone);

  // Cross-day shift: end time is on the next calendar day
  if (shift.isCrossDay) {
    shiftEnd = shiftEnd.plus({ days: 1 });
  }

  // Handle case where endTime is before startTime even without isCrossDay flag
  // (e.g., shift 22:00 - 06:00 without isCrossDay set — defensive handling)
  if (shiftEnd <= shiftStart && !shift.isCrossDay) {
    shiftEnd = shiftEnd.plus({ days: 1 });
  }

  return { shiftStart, shiftEnd };
}

// ─── Deduction Calculator ───────────────────────────────────────────────────

/**
 * Calculate deduction amount based on type and configuration.
 *
 * @param deductionType  - 'NONE' | 'HALF_DAY_AFTER_LIMIT' | 'PERCENTAGE'
 * @param deductionValue - The numeric value (percentage or threshold)
 * @param isTriggered    - Whether the condition (late/early) was triggered
 * @returns Deduction amount (0 if none, 0.5 for half-day, percentage value otherwise)
 */
function calculateDeduction(
  deductionType: string,
  deductionValue: number | null,
  isTriggered: boolean,
): number | null {
  if (!isTriggered) return null;

  switch (deductionType) {
    case 'HALF_DAY_AFTER_LIMIT':
      // Deducts half a day when triggered
      return 0.5;

    case 'PERCENTAGE':
      // Deducts a percentage of the day (value is the percentage, e.g., 25 = 25%)
      return deductionValue != null ? deductionValue / 100 : null;

    case 'NONE':
    default:
      return null;
  }
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve the final attendance status for an employee on a given date.
 *
 * This is a PURE FUNCTION — no side effects, fully deterministic.
 *
 * @param punchIn          - Employee's resolved punch-in time (null if no punch)
 * @param punchOut         - Employee's resolved punch-out time (null if missing)
 * @param shift            - Assigned shift info (null if no shift assigned)
 * @param policy           - Resolved policy from the policy resolver
 * @param context          - Evaluation context (holiday, weekoff, leave flags)
 * @param rules            - Attendance rule settings for deductions and exceptions
 * @param companyTimezone  - IANA timezone string for all time comparisons
 * @returns StatusResult with all computed fields
 */
export function resolveAttendanceStatus(
  punchIn: Date | null,
  punchOut: Date | null,
  shift: ShiftInfo | null,
  policy: ResolvedPolicy,
  context: EvaluationContext,
  rules: AttendanceRulesInput,
  companyTimezone: string,
): StatusResult {
  // ── Step 1: No punch — determine contextual status ──

  if (!punchIn) {
    if (context.isHoliday) {
      return buildResult('HOLIDAY', `Holiday: ${context.holidayName ?? 'Company holiday'}`);
    }
    if (context.isWeekOff) {
      return buildResult('WEEK_OFF', 'Weekly off');
    }
    if (rules.autoMarkAbsentIfNoPunch) {
      return buildResult('ABSENT', 'No punch recorded — auto-marked absent');
    }
    return buildResult('ABSENT', 'No punch recorded');
  }

  // ── Step 2: Missing punch-out -> INCOMPLETE (Appendix B.3) ──

  if (!punchOut) {
    return buildResult('INCOMPLETE', 'Punch-in recorded but punch-out missing', {
      isLate: false,
      lateMinutes: 0,
    });
  }

  // ── A8: Apply punch mode validation ──

  let effectivePunchIn = punchIn;
  let effectivePunchOut = punchOut;
  let precomputedWorkedMinutes: number | null = null;

  if (punchIn && punchOut && policy.punchMode !== 'FIRST_LAST') {
    const punches = [
      { time: punchIn, direction: 'IN' as const },
      { time: punchOut, direction: 'OUT' as const },
    ];

    // For SHIFT_BASED mode, provide shift start/end as Date objects
    let shiftStartDate: Date | null = null;
    let shiftEndDate: Date | null = null;
    if (shift) {
      const dateStr = DateTime.fromJSDate(context.date).toFormat('yyyy-MM-dd');
      const parsed = parseShiftTimes(dateStr, shift, companyTimezone);
      shiftStartDate = parsed.shiftStart.toJSDate();
      shiftEndDate = parsed.shiftEnd.toJSDate();
    }

    const validated = validatePunchSequence(
      punches,
      policy.punchMode,
      shiftStartDate,
      shiftEndDate,
    );

    if (validated.resolvedIn) effectivePunchIn = validated.resolvedIn;
    if (validated.resolvedOut) effectivePunchOut = validated.resolvedOut;

    // For EVERY_PAIR mode, use the precomputed totalWorkedMinutes (sum of pair durations)
    // instead of simple punchOut - punchIn span
    if (policy.punchMode === 'EVERY_PAIR' && validated.totalWorkedMinutes != null) {
      precomputedWorkedMinutes = validated.totalWorkedMinutes;
    }
  }

  // ── Step 3: Calculate raw worked minutes ──

  const rawWorkedMinutes = precomputedWorkedMinutes != null
    ? precomputedWorkedMinutes
    : Math.max(0, (effectivePunchOut.getTime() - effectivePunchIn.getTime()) / (1000 * 60));

  // ── Step 4: Deduct unpaid breaks -> net worked minutes ──

  const netWorkedMinutes = Math.max(0, rawWorkedMinutes - policy.breakDeductionMinutes);

  // ── Step 5: Apply rounding -> net worked hours ──

  const rawWorkedHours = netWorkedMinutes / 60;
  const workedHours = applyRounding(rawWorkedHours, policy.workingHoursRounding);

  // ── Step 6: Determine late arrival ──

  let isLate = false;
  let lateMinutes = 0;

  if (shift) {
    const dateStr = DateTime.fromJSDate(context.date).toFormat('yyyy-MM-dd');
    const { shiftStart } = parseShiftTimes(dateStr, shift, companyTimezone);

    const punchInDt = DateTime.fromJSDate(effectivePunchIn).setZone(companyTimezone);
    const delayMinutes = punchInDt.diff(shiftStart, 'minutes').minutes;

    if (delayMinutes > policy.gracePeriodMinutes) {
      isLate = true;
      lateMinutes = Math.round(delayMinutes);
    }

    // ── Step 7: Auto-absent if delay > maxLateCheckInMinutes ──

    if (delayMinutes > policy.maxLateCheckInMinutes) {
      return buildResult(
        'ABSENT',
        `Late by ${Math.round(delayMinutes)}min — exceeds max late check-in of ${policy.maxLateCheckInMinutes}min`,
        { isLate: true, lateMinutes: Math.round(delayMinutes), workedHours },
      );
    }
  }

  // ── Step 8: Apply exception handling (suppress late on holiday/weekoff/leave) ──

  let lateSuppressed = false;

  if (isLate) {
    if (context.isHoliday && rules.ignoreLateOnHoliday) {
      isLate = false;
      lateSuppressed = true;
    } else if (context.isWeekOff && rules.ignoreLateOnWeekOff) {
      isLate = false;
      lateSuppressed = true;
    }
    // Note: ignoreLateOnLeaveDay is handled by the caller (requires leave data
    // which is not part of the EvaluationContext). If the context indicates leave,
    // the caller should set isHoliday or handle before calling this resolver.
  }

  // ── Step 9: Determine early exit ──

  let isEarlyExit = false;
  let earlyMinutes = 0;

  if (shift) {
    const dateStr = DateTime.fromJSDate(context.date).toFormat('yyyy-MM-dd');
    const { shiftEnd } = parseShiftTimes(dateStr, shift, companyTimezone);

    const punchOutDt = DateTime.fromJSDate(effectivePunchOut).setZone(companyTimezone);
    const earlyByMinutes = shiftEnd.diff(punchOutDt, 'minutes').minutes;

    if (earlyByMinutes > policy.earlyExitToleranceMinutes) {
      isEarlyExit = true;
      earlyMinutes = Math.round(earlyByMinutes);
    }
  }

  // ── Step 10: Classify status ──

  let status: string;
  let finalStatusReason: string;

  if (context.isHoliday) {
    // Worked on a holiday — status stays HOLIDAY, but workedHours are recorded
    status = 'HOLIDAY';
    finalStatusReason = `Worked ${workedHours}h on holiday: ${context.holidayName ?? 'Company holiday'}`;
  } else if (context.isWeekOff) {
    // Worked on a week off — status stays WEEK_OFF, workedHours recorded for OT
    status = 'WEEK_OFF';
    finalStatusReason = `Worked ${workedHours}h on week off`;
  } else if (workedHours >= policy.fullDayThresholdHours) {
    // Full day worked
    if (isLate) {
      status = 'LATE';
      finalStatusReason = `Late by ${lateMinutes}min (full day worked: ${workedHours}h)`;
    } else {
      status = 'PRESENT';
      finalStatusReason = `Full day: ${workedHours}h worked`;
    }
  } else if (workedHours >= policy.halfDayThresholdHours) {
    // Half day
    if (rules.autoHalfDayEnabled) {
      status = 'HALF_DAY';
      finalStatusReason = `Half day: ${workedHours}h worked (threshold: ${policy.halfDayThresholdHours}h)`;
    } else if (isLate) {
      status = 'LATE';
      finalStatusReason = `Late by ${lateMinutes}min, ${workedHours}h worked`;
    } else {
      status = 'PRESENT';
      finalStatusReason = `${workedHours}h worked`;
    }
  } else if (isEarlyExit) {
    // Below half-day threshold with early exit
    if (rules.lopAutoDeduct) {
      status = 'LOP';
      finalStatusReason = `Early exit by ${earlyMinutes}min, only ${workedHours}h worked — below half-day threshold`;
    } else {
      status = 'EARLY_EXIT';
      finalStatusReason = `Early exit by ${earlyMinutes}min, ${workedHours}h worked`;
    }
  } else {
    // Below half-day threshold without early exit classification
    if (rules.lopAutoDeduct) {
      status = 'LOP';
      finalStatusReason = `Only ${workedHours}h worked — below half-day threshold of ${policy.halfDayThresholdHours}h`;
    } else if (rules.autoHalfDayEnabled) {
      status = 'HALF_DAY';
      finalStatusReason = `${workedHours}h worked — classified as half day`;
    } else {
      status = 'PRESENT';
      finalStatusReason = `${workedHours}h worked`;
    }
  }

  // ── Step 11: Calculate OT hours ──

  let overtimeHours = 0;

  if (workedHours > policy.fullDayThresholdHours) {
    overtimeHours = applyRounding(
      workedHours - policy.fullDayThresholdHours,
      policy.workingHoursRounding,
    );
  }

  // ── Step 12: Calculate deductions ──

  const appliedLateDeduction = calculateDeduction(
    rules.lateDeductionType,
    rules.lateDeductionValue,
    isLate,
  );

  const appliedEarlyExitDeduction = calculateDeduction(
    rules.earlyExitDeductionType,
    rules.earlyExitDeductionValue,
    isEarlyExit,
  );

  // Build the result, appending suppression note if applicable
  if (lateSuppressed) {
    finalStatusReason += ' (late suppressed — exception rule applied)';
  }

  const result: StatusResult = {
    status,
    finalStatusReason,
    isLate,
    lateMinutes,
    isEarlyExit,
    earlyMinutes,
    workedHours,
    overtimeHours,
    appliedLateDeduction,
    appliedEarlyExitDeduction,
  };

  logger.info(
    `Attendance status resolved [employee=${context.employeeId}, date=${DateTime.fromJSDate(context.date).toFormat('yyyy-MM-dd')}] status=${result.status} reason=${result.finalStatusReason}`,
  );

  return result;
}

// ─── Result Builder Helper ──────────────────────────────────────────────────

/**
 * Build a StatusResult with default zero values, optionally overriding specific fields.
 */
function buildResult(
  status: string,
  finalStatusReason: string,
  overrides?: Partial<StatusResult>,
): StatusResult {
  return {
    status,
    finalStatusReason,
    isLate: false,
    lateMinutes: 0,
    isEarlyExit: false,
    earlyMinutes: 0,
    workedHours: 0,
    overtimeHours: 0,
    appliedLateDeduction: null,
    appliedEarlyExitDeduction: null,
    ...overrides,
  };
}
