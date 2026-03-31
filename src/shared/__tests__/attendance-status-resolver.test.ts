/**
 * Unit tests for attendance-status-resolver.service.ts
 *
 * Source file: src/shared/services/attendance-status-resolver.service.ts
 *
 * resolveAttendanceStatus is a PURE FUNCTION — no mocks required.
 * Only the logger is suppressed (it is imported by the service).
 *
 * Test coverage: all 10 status outcomes + deductions + rounding + timezone.
 */

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  resolveAttendanceStatus,
  type ShiftInfo,
  type AttendanceRulesInput,
} from '@/shared/services/attendance-status-resolver.service';
import type { ResolvedPolicy, EvaluationContext } from '@/shared/services/policy-resolver.service';

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

const TZ_IST = 'Asia/Kolkata';
const TZ_EST = 'America/New_York';

/** Standard day shift 09:00 – 17:00 */
const DAY_SHIFT: ShiftInfo = { startTime: '09:00', endTime: '17:00', isCrossDay: false };

/** Night shift 22:00 – 06:00 (cross-day) */
const NIGHT_SHIFT: ShiftInfo = { startTime: '22:00', endTime: '06:00', isCrossDay: true };

/** Default policy matching SYSTEM_DEFAULTS */
const DEFAULT_POLICY: ResolvedPolicy = {
  gracePeriodMinutes: 15,
  earlyExitToleranceMinutes: 15,
  halfDayThresholdHours: 4,
  fullDayThresholdHours: 8,
  maxLateCheckInMinutes: 240,
  selfieRequired: false,
  gpsRequired: false,
  punchMode: 'FIRST_LAST',
  workingHoursRounding: 'NONE',
  breakDeductionMinutes: 0,
};

/** Default attendance rules (permissive) */
const DEFAULT_RULES: AttendanceRulesInput = {
  lopAutoDeduct: false,
  autoMarkAbsentIfNoPunch: true,
  autoHalfDayEnabled: true,
  lateDeductionType: 'NONE',
  lateDeductionValue: null,
  earlyExitDeductionType: 'NONE',
  earlyExitDeductionValue: null,
  ignoreLateOnLeaveDay: true,
  ignoreLateOnHoliday: true,
  ignoreLateOnWeekOff: true,
};

/** Standard evaluation context — normal working day */
const NORMAL_CONTEXT: EvaluationContext = {
  employeeId: 'emp-001',
  shiftId: 'shift-001',
  locationId: null,
  date: new Date('2026-03-30'),
  isHoliday: false,
  isWeekOff: false,
};

/** Build a punch Date in IST from HH:mm on 2026-03-30 */
function ist(dateStr: string, timeStr: string): Date {
  // Parse as IST: IST = UTC+5:30
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  // IST offset: -330 minutes from UTC (IST is UTC+5:30, so to get UTC subtract 5:30)
  const utcMs = Date.UTC(y!, mo! - 1, d!, (h ?? 0) - 5, (m ?? 0) - 30, 0, 0);
  return new Date(utcMs);
}

/** Build a punch Date in EST from HH:mm on a given date */
function est(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  // EST = UTC-5
  const utcMs = Date.UTC(y!, mo! - 1, d!, (h ?? 0) + 5, m ?? 0, 0, 0);
  return new Date(utcMs);
}

// ─── Step 1: No punch handling ───────────────────────────────────────────────

describe('resolveAttendanceStatus — no punch', () => {
  it('should return HOLIDAY when no punch and context isHoliday=true', () => {
    const result = resolveAttendanceStatus(
      null, null, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true, holidayName: 'Holi' },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('HOLIDAY');
    expect(result.finalStatusReason).toContain('Holi');
    expect(result.workedHours).toBe(0);
  });

  it('should return WEEK_OFF when no punch and context isWeekOff=true', () => {
    const result = resolveAttendanceStatus(
      null, null, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isWeekOff: true },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('WEEK_OFF');
    expect(result.finalStatusReason).toContain('Weekly off');
  });

  it('should return ABSENT with autoMarkAbsentIfNoPunch=true', () => {
    const result = resolveAttendanceStatus(
      null, null, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, autoMarkAbsentIfNoPunch: true },
      TZ_IST,
    );
    expect(result.status).toBe('ABSENT');
    expect(result.finalStatusReason).toContain('auto-marked absent');
  });

  it('should return ABSENT with autoMarkAbsentIfNoPunch=false (no punch, not holiday/weekoff)', () => {
    const result = resolveAttendanceStatus(
      null, null, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, autoMarkAbsentIfNoPunch: false },
      TZ_IST,
    );
    expect(result.status).toBe('ABSENT');
  });

  it('HOLIDAY takes priority over WEEK_OFF when both are true', () => {
    const result = resolveAttendanceStatus(
      null, null, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true, isWeekOff: true, holidayName: 'Diwali' },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('HOLIDAY');
  });
});

// ─── Step 2: Missing punch-out → INCOMPLETE ──────────────────────────────────

describe('resolveAttendanceStatus — INCOMPLETE', () => {
  it('should return INCOMPLETE when punchIn exists but punchOut is null', () => {
    const punchIn = ist('2026-03-30', '09:00');
    const result = resolveAttendanceStatus(
      punchIn, null, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('INCOMPLETE');
    expect(result.finalStatusReason).toContain('punch-out missing');
    expect(result.workedHours).toBe(0);
    expect(result.isLate).toBe(false);
  });
});

// ─── Status: PRESENT ─────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — PRESENT', () => {
  it('should return PRESENT for full day on time (09:00–17:00)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('PRESENT');
    expect(result.isLate).toBe(false);
    expect(result.lateMinutes).toBe(0);
    expect(result.workedHours).toBe(8);
    expect(result.overtimeHours).toBe(0);
  });

  it('should return PRESENT when punched in within grace period (09:10 with 15 min grace)', () => {
    const punchIn  = ist('2026-03-30', '09:10');
    const punchOut = ist('2026-03-30', '17:10');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('PRESENT');
    expect(result.isLate).toBe(false);
  });
});

// ─── Status: LATE ────────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — LATE', () => {
  it('should return LATE when arriving 25 min late (beyond 15 min grace), full day worked', () => {
    const punchIn  = ist('2026-03-30', '09:25');
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('LATE');
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(25);
    expect(result.finalStatusReason).toContain('Late by 25min');
  });

  it('should not mark late when exactly at grace boundary (09:15)', () => {
    // Exactly 15 min: delayMinutes = 15, condition is > 15, so NOT late
    const punchIn  = ist('2026-03-30', '09:15');
    const punchOut = ist('2026-03-30', '17:15');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.isLate).toBe(false);
    expect(result.status).toBe('PRESENT');
  });
});

// ─── Status: ABSENT (late beyond maxLateCheckIn) ──────────────────────────────

describe('resolveAttendanceStatus — ABSENT via maxLateCheckIn', () => {
  it('should return ABSENT when late beyond maxLateCheckInMinutes (240 min)', () => {
    // Punched in at 13:05 — 4h5m = 245 min late (> 240 max)
    const punchIn  = ist('2026-03-30', '13:05');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('ABSENT');
    expect(result.isLate).toBe(true);
    expect(result.finalStatusReason).toContain('exceeds max late check-in');
  });

  it('should not mark absent when late is exactly at the threshold (240 min = 13:00 check-in)', () => {
    // delayMinutes = 240, condition is > 240, so NOT absent
    const punchIn  = ist('2026-03-30', '13:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).not.toBe('ABSENT');
  });
});

// ─── Status: HALF_DAY ────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — HALF_DAY', () => {
  it('should return HALF_DAY when worked 5h (>halfDay 4h, <fullDay 8h) with autoHalfDayEnabled', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '14:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, autoHalfDayEnabled: true },
      TZ_IST,
    );
    expect(result.status).toBe('HALF_DAY');
    expect(result.workedHours).toBe(5);
    expect(result.finalStatusReason).toContain('Half day');
  });

  it('should return PRESENT (not HALF_DAY) when autoHalfDayEnabled=false and worked half day', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '14:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, autoHalfDayEnabled: false, lopAutoDeduct: false },
      TZ_IST,
    );
    // Without autoHalfDay and without lopAutoDeduct, falls to PRESENT
    expect(result.status).toBe('PRESENT');
  });
});

// ─── Status: LOP ─────────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — LOP', () => {
  it('should return LOP when below halfDayThreshold and lopAutoDeduct=true', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '12:00'); // 3h only
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lopAutoDeduct: true },
      TZ_IST,
    );
    expect(result.status).toBe('LOP');
    expect(result.workedHours).toBe(3);
    expect(result.finalStatusReason).toContain('below half-day threshold');
  });

  it('should return LOP with early exit when lopAutoDeduct=true and left early', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '11:00'); // 2h — early exit (left 6h before shift end)
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lopAutoDeduct: true },
      TZ_IST,
    );
    expect(result.status).toBe('LOP');
  });
});

// ─── Status: EARLY_EXIT ──────────────────────────────────────────────────────

describe('resolveAttendanceStatus — EARLY_EXIT', () => {
  it('should return EARLY_EXIT when exited early and lopAutoDeduct=false', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '11:00'); // Left 6h before shift end
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lopAutoDeduct: false, autoHalfDayEnabled: false },
      TZ_IST,
    );
    expect(result.status).toBe('EARLY_EXIT');
    expect(result.isEarlyExit).toBe(true);
    expect(result.earlyMinutes).toBeGreaterThan(0);
  });

  it('should not mark early exit when within earlyExitToleranceMinutes', () => {
    // Left 10 min early (tolerance is 15 min)
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.isEarlyExit).toBe(false);
    // 7h50m = 7.83h < fullDayThreshold 8h → HALF_DAY (autoHalfDay=true)
    expect(result.status).toBe('HALF_DAY');
  });
});

// ─── Status: HOLIDAY (worked on holiday) ─────────────────────────────────────

describe('resolveAttendanceStatus — HOLIDAY (worked)', () => {
  it('should return HOLIDAY with workedHours populated when punches exist on a holiday', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true, holidayName: 'Holi' },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('HOLIDAY');
    expect(result.workedHours).toBe(8);
    expect(result.finalStatusReason).toContain('Holi');
    expect(result.overtimeHours).toBe(0); // worked == fullDay threshold, not exceeding
  });

  it('should record overtime hours when worked beyond fullDayThreshold on holiday', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '20:00'); // 11h worked
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('HOLIDAY');
    expect(result.workedHours).toBe(11);
    expect(result.overtimeHours).toBe(3);
  });
});

// ─── Status: WEEK_OFF (worked on week off) ───────────────────────────────────

describe('resolveAttendanceStatus — WEEK_OFF (worked)', () => {
  it('should return WEEK_OFF with workedHours when punches exist on a week off', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isWeekOff: true },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('WEEK_OFF');
    expect(result.workedHours).toBe(8);
    expect(result.finalStatusReason).toContain('week off');
  });

  it('should record overtime hours when worked beyond fullDayThreshold on week off', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '19:00'); // 10h
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isWeekOff: true },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.overtimeHours).toBe(2);
  });
});

// ─── Exception Handling: suppress late on holiday / week off ─────────────────

describe('resolveAttendanceStatus — exception handling', () => {
  it('should suppress late flag when ignoreLateOnHoliday=true and context isHoliday', () => {
    const punchIn  = ist('2026-03-30', '09:30'); // 30 min late
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true },
      { ...DEFAULT_RULES, ignoreLateOnHoliday: true },
      TZ_IST,
    );
    // Status is HOLIDAY (worked on holiday), late suppressed
    expect(result.status).toBe('HOLIDAY');
    expect(result.isLate).toBe(false);
    expect(result.finalStatusReason).toContain('late suppressed');
  });

  it('should suppress late flag when ignoreLateOnWeekOff=true and context isWeekOff', () => {
    const punchIn  = ist('2026-03-30', '09:30'); // 30 min late
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isWeekOff: true },
      { ...DEFAULT_RULES, ignoreLateOnWeekOff: true },
      TZ_IST,
    );
    expect(result.isLate).toBe(false);
    expect(result.finalStatusReason).toContain('late suppressed');
  });

  it('should NOT suppress late on holiday when ignoreLateOnHoliday=false', () => {
    const punchIn  = ist('2026-03-30', '09:30');
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, isHoliday: true },
      { ...DEFAULT_RULES, ignoreLateOnHoliday: false },
      TZ_IST,
    );
    expect(result.isLate).toBe(true);
    expect(result.finalStatusReason).not.toContain('suppressed');
  });
});

// ─── Deduction calculations ───────────────────────────────────────────────────

describe('resolveAttendanceStatus — deductions', () => {
  it('should return null appliedLateDeduction when deductionType=NONE and not late', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lateDeductionType: 'NONE' },
      TZ_IST,
    );
    expect(result.appliedLateDeduction).toBeNull();
  });

  it('should return 0.5 (half day) deduction for HALF_DAY_AFTER_LIMIT when late', () => {
    const punchIn  = ist('2026-03-30', '09:30'); // 30 min late
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lateDeductionType: 'HALF_DAY_AFTER_LIMIT' },
      TZ_IST,
    );
    expect(result.appliedLateDeduction).toBe(0.5);
  });

  it('should compute PERCENTAGE deduction correctly when late', () => {
    const punchIn  = ist('2026-03-30', '09:30'); // 30 min late
    const punchOut = ist('2026-03-30', '17:30');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      {
        ...DEFAULT_RULES,
        lateDeductionType: 'PERCENTAGE',
        lateDeductionValue: 25, // 25%
      },
      TZ_IST,
    );
    expect(result.appliedLateDeduction).toBeCloseTo(0.25, 5);
  });

  it('should apply earlyExitDeduction PERCENTAGE when left early', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '11:00'); // 6h early
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      {
        ...DEFAULT_RULES,
        earlyExitDeductionType: 'PERCENTAGE',
        earlyExitDeductionValue: 50,
        lopAutoDeduct: false,
        autoHalfDayEnabled: false,
      },
      TZ_IST,
    );
    expect(result.appliedEarlyExitDeduction).toBeCloseTo(0.5, 5);
  });

  it('should return null earlyExitDeduction when not early exit', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, earlyExitDeductionType: 'HALF_DAY_AFTER_LIMIT' },
      TZ_IST,
    );
    expect(result.appliedEarlyExitDeduction).toBeNull();
  });
});

// ─── Break deduction ─────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — break deduction', () => {
  it('should deduct 30 min break from rawWorkedMinutes', () => {
    const policy: ResolvedPolicy = { ...DEFAULT_POLICY, breakDeductionMinutes: 30 };
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00'); // raw 8h
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, policy,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // Net: 8h - 0.5h = 7.5h (below fullDayThreshold 8h → HALF_DAY)
    expect(result.workedHours).toBe(7.5);
    expect(result.status).toBe('HALF_DAY');
  });

  it('should not produce negative workedHours from a large break deduction', () => {
    const policy: ResolvedPolicy = { ...DEFAULT_POLICY, breakDeductionMinutes: 600 };
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '10:00'); // only 1h raw
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, policy,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.workedHours).toBeGreaterThanOrEqual(0);
  });
});

// ─── Rounding ────────────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — workingHoursRounding', () => {
  it('NONE should not round — 7h50m = 7.83h (rounded to 2dp)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50'); // 7h50m
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'NONE' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.workedHours).toBeCloseTo(7.83, 1);
  });

  it('NEAREST_15 should round 7h50m to 7.75h (nearest 15 min = 7h45m)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50'); // 7h50m = 7.833h
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'NEAREST_15' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // 7.833 * 4 = 31.33 → round to 31 → 31/4 = 7.75
    expect(result.workedHours).toBe(7.75);
  });

  it('NEAREST_15 should round 8h7m to 8.0h (nearest 15 = 8.0)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:07'); // 8h7m = 8.117h
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'NEAREST_15' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // 8.117 * 4 = 32.47 → round to 32 → 32/4 = 8.0
    expect(result.workedHours).toBe(8);
  });

  it('NEAREST_30 should round 7h50m to 8.0h', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'NEAREST_30' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // 7.833 * 2 = 15.67 → round to 16 → 16/2 = 8.0
    expect(result.workedHours).toBe(8);
  });

  it('FLOOR_15 should floor 7h50m to 7.75h', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'FLOOR_15' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // floor(7.833 * 4) / 4 = floor(31.33) / 4 = 31/4 = 7.75
    expect(result.workedHours).toBe(7.75);
  });

  it('CEIL_15 should ceil 7h50m to 8.0h', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '16:50');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT,
      { ...DEFAULT_POLICY, workingHoursRounding: 'CEIL_15' },
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    // ceil(7.833 * 4) / 4 = ceil(31.33) / 4 = 32/4 = 8.0
    expect(result.workedHours).toBe(8);
  });
});

// ─── Overtime ────────────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — overtime', () => {
  it('should record 2h overtime when worked 10h (fullDayThreshold=8h)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '19:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.status).toBe('PRESENT');
    expect(result.workedHours).toBe(10);
    expect(result.overtimeHours).toBe(2);
  });

  it('should record 0 overtime when worked exactly fullDayThreshold', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ_IST,
    );
    expect(result.overtimeHours).toBe(0);
  });
});

// ─── No-shift scenario ───────────────────────────────────────────────────────

describe('resolveAttendanceStatus — no shift assigned', () => {
  it('should not mark late when no shift is assigned', () => {
    const punchIn  = ist('2026-03-30', '10:00');
    const punchOut = ist('2026-03-30', '18:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, shiftId: null },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.isLate).toBe(false);
    expect(result.lateMinutes).toBe(0);
    expect(result.workedHours).toBe(8);
    expect(result.status).toBe('PRESENT');
  });

  it('should not mark early exit when no shift is assigned', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '14:00'); // short day
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, shiftId: null },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.isEarlyExit).toBe(false);
  });
});

// ─── Timezone: America/New_York ───────────────────────────────────────────────

describe('resolveAttendanceStatus — America/New_York timezone', () => {
  it('should calculate correct worked hours using EST timezone', () => {
    const punchIn  = est('2026-03-30', '09:00');
    const punchOut = est('2026-03-30', '17:00');
    // No shift assigned — avoids timezone-dependent late/early exit checks
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, date: new Date('2026-03-30'), shiftId: null },
      DEFAULT_RULES, TZ_EST,
    );
    expect(result.workedHours).toBe(8);
    expect(result.status).toBe('PRESENT');
  });
});

// ─── Night shift ─────────────────────────────────────────────────────────────

describe('resolveAttendanceStatus — night shift (22:00–06:00)', () => {
  it('should calculate correct worked hours for cross-day night shift', () => {
    // Employee clocks in at 22:10, clocks out at 06:00 next day = 7h50m
    const punchIn  = ist('2026-03-30', '22:10');
    const punchOut = ist('2026-03-31', '06:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, date: new Date('2026-03-30') },
      DEFAULT_RULES, TZ_IST,
    );
    // 7h50m = 7.83h rounded to 2dp
    expect(result.workedHours).toBeCloseTo(7.83, 1);
    // < fullDayThreshold (8h) → HALF_DAY
    expect(result.status).toBe('HALF_DAY');
  });

  it('should mark LATE when punch-in for night shift is beyond grace period', () => {
    // Night shift starts 22:00, grace=15min, punched in at 22:30 → 30 min late
    const punchIn  = ist('2026-03-30', '22:30');
    const punchOut = ist('2026-03-31', '07:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, date: new Date('2026-03-30') },
      DEFAULT_RULES, TZ_IST,
    );
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(30);
  });
});
