/**
 * Cross-day / night shift attendance tests
 *
 * Tests the interaction between:
 *   - getAttendanceDateForShift() (timezone.ts)
 *   - resolveAttendanceStatus() (attendance-status-resolver.service.ts)
 *
 * for night/cross-day shifts where punches span midnight.
 */

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { resolveAttendanceStatus, type ShiftInfo, type AttendanceRulesInput } from '@/shared/services/attendance-status-resolver.service';
import { getAttendanceDateForShift, parseInCompanyTimezone } from '@/shared/utils/timezone';
import type { ResolvedPolicy, EvaluationContext } from '@/shared/services/policy-resolver.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TZ = 'Asia/Kolkata';

const NIGHT_SHIFT: ShiftInfo = { startTime: '22:00', endTime: '06:00', isCrossDay: true };
const EARLY_SHIFT: ShiftInfo = { startTime: '06:00', endTime: '14:00', isCrossDay: false };

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

/** Build a UTC Date from a local IST time string. IST = UTC+5:30 */
function ist(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y!, mo! - 1, d!, (h ?? 0) - 5, (m ?? 0) - 30, 0, 0);
  return new Date(utcMs);
}

// ─── getAttendanceDateForShift — night shift ──────────────────────────────────

describe('getAttendanceDateForShift — night shift', () => {
  it('should return the shift start date when punch is at 22:15 (evening start)', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '22:15', TZ);
    const date = getAttendanceDateForShift(
      punchTime,
      { isCrossDay: true, startTime: '22:00' },
      '00:00',
      TZ,
    );
    expect(date).toBe('2026-03-30');
  });

  it('should assign punch at 02:00 next morning to the night shift start date', () => {
    // Punch at 02:00 on 2026-03-31 belongs to the shift that started 2026-03-30
    const punchTime = parseInCompanyTimezone('2026-03-31', '02:00', TZ);
    const date = getAttendanceDateForShift(
      punchTime,
      { isCrossDay: true, startTime: '22:00' },
      '00:00',
      TZ,
    );
    expect(date).toBe('2026-03-30');
  });

  it('should assign punch at 05:55 (near shift end) to the night shift start date', () => {
    const punchTime = parseInCompanyTimezone('2026-03-31', '05:55', TZ);
    const date = getAttendanceDateForShift(
      punchTime,
      { isCrossDay: true, startTime: '22:00' },
      '00:00',
      TZ,
    );
    expect(date).toBe('2026-03-30');
  });

  it('should assign punch at 22:00 exactly to the current date', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '22:00', TZ);
    const date = getAttendanceDateForShift(
      punchTime,
      { isCrossDay: true, startTime: '22:00' },
      '00:00',
      TZ,
    );
    expect(date).toBe('2026-03-30');
  });
});

// ─── resolveAttendanceStatus — night shift ────────────────────────────────────

describe('resolveAttendanceStatus — night shift cross-day calculation', () => {
  it('should correctly calculate 8h worked for 22:00–06:00 night shift (full day)', () => {
    const punchIn  = ist('2026-03-30', '22:00');
    const punchOut = ist('2026-03-31', '06:00');
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-night',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    expect(result.workedHours).toBe(8);
    expect(result.status).toBe('PRESENT');
  });

  it('should record 7h50m for punch 22:10–06:00 night shift', () => {
    const punchIn  = ist('2026-03-30', '22:10');
    const punchOut = ist('2026-03-31', '06:00');
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-night',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    // 7h50m = 7.8333h, rounded to 2dp = 7.83
    expect(result.workedHours).toBeCloseTo(7.83, 1);
    // 7.83 < 8 (fullDayThreshold) → HALF_DAY with autoHalfDayEnabled
    expect(result.status).toBe('HALF_DAY');
  });

  it('should mark LATE when punch-in is 30 min past night shift start (beyond 15 min grace)', () => {
    const punchIn  = ist('2026-03-30', '22:30'); // 30 min late
    const punchOut = ist('2026-03-31', '06:30');
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-night',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(30);
    expect(result.status).toBe('LATE');
  });

  it('should mark EARLY_EXIT when clocking out 30 min before night shift end (beyond 15 min tolerance)', () => {
    const punchIn  = ist('2026-03-30', '22:00');
    const punchOut = ist('2026-03-31', '05:30'); // 30 min early exit
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-night',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    expect(result.isEarlyExit).toBe(true);
    expect(result.earlyMinutes).toBe(30);
  });

  it('should compute 2h OT for night shift punch-out at 08:00 (worked 10h)', () => {
    const punchIn  = ist('2026-03-30', '22:00');
    const punchOut = ist('2026-03-31', '08:00'); // 10h
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-night',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, NIGHT_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    expect(result.workedHours).toBe(10);
    expect(result.overtimeHours).toBe(2);
  });
});

// ─── Day boundary time — 06:00 boundary ──────────────────────────────────────

describe('getAttendanceDateForShift — day boundary 06:00', () => {
  const shift = { isCrossDay: false, startTime: '09:00' };

  it('should assign punch at 05:00 (before 06:00 boundary) to the previous date', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '05:00', TZ);
    const date = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
    expect(date).toBe('2026-03-29');
  });

  it('should assign punch at 07:00 (after 06:00 boundary) to the current date', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '07:00', TZ);
    const date = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
    expect(date).toBe('2026-03-30');
  });

  it('should assign punch at exactly 06:00 to the current date (boundary is exclusive)', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '06:00', TZ);
    const date = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
    // 06:00 = 360 min, boundary = 360 min, condition is punchMinutes < boundary → false → current date
    expect(date).toBe('2026-03-30');
  });

  it('should handle midnight punch with 00:00 boundary (default — always current date)', () => {
    const punchTime = parseInCompanyTimezone('2026-03-30', '00:00', TZ);
    const date = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
    // boundary=0 minutes, condition is 0 > 0 → false → current date
    expect(date).toBe('2026-03-30');
  });
});

// ─── Early morning shift (06:00–14:00) ───────────────────────────────────────

describe('resolveAttendanceStatus — early morning shift', () => {
  it('should calculate 8h worked for an early 06:00–14:00 shift', () => {
    const punchIn  = ist('2026-03-30', '06:00');
    const punchOut = ist('2026-03-30', '14:00');
    const context: EvaluationContext = {
      employeeId: 'emp-002',
      shiftId: 'shift-early',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, EARLY_SHIFT, DEFAULT_POLICY,
      context, DEFAULT_RULES, TZ,
    );
    expect(result.workedHours).toBe(8);
    expect(result.status).toBe('PRESENT');
  });
});
