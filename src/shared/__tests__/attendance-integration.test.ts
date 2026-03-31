/**
 * Attendance Integration Tests — Full flow simulation
 *
 * Tests the complete punch → validate → resolve → status pipeline
 * by calling each service in sequence with coordinated mock data.
 *
 * Simulates what an attendance service would do when processing
 * a raw punch submission.
 *
 * Services exercised (in order):
 *   1. validatePunchSequence   (punch-validator)
 *   2. resolvePolicy           (policy-resolver — mocked cache)
 *   3. resolveAttendanceStatus (status-resolver — pure function)
 *
 * Verifies that the combined output contains all fields needed to
 * persist an AttendanceRecord with full snapshot and audit trail.
 */

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedShift:            jest.fn(),
  getCachedLocation:         jest.fn(),
  getCachedAttendanceRules:  jest.fn(),
  getCachedShiftBreaks:      jest.fn(),
}));

import { validatePunchSequence, type PunchEntry } from '@/shared/services/punch-validator.service';
import { resolvePolicy, type EvaluationContext } from '@/shared/services/policy-resolver.service';
import { resolveAttendanceStatus, type AttendanceRulesInput } from '@/shared/services/attendance-status-resolver.service';
import {
  getCachedShift,
  getCachedLocation,
  getCachedAttendanceRules,
  getCachedShiftBreaks,
} from '@/shared/utils/config-cache';

const mockGetShift    = getCachedShift            as jest.Mock;
const mockGetLocation = getCachedLocation         as jest.Mock;
const mockGetRules    = getCachedAttendanceRules   as jest.Mock;
const mockGetBreaks   = getCachedShiftBreaks       as jest.Mock;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-int-001';
const TZ = 'Asia/Kolkata';

function ist(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, (h ?? 0) - 5, (m ?? 0) - 30, 0, 0));
}

function punch(timeStr: string): PunchEntry {
  return { time: ist('2026-03-30', timeStr) };
}

const MOCK_SHIFT = {
  id: 'shift-001',
  startTime: '09:00',
  endTime: '17:00',
  isCrossDay: false,
  gracePeriodMinutes: null,
  earlyExitToleranceMinutes: null,
  halfDayThresholdHours: null,
  fullDayThresholdHours: null,
  maxLateCheckInMinutes: null,
  requireSelfie: null,
  requireGPS: null,
};

const MOCK_RULES = {
  id: 'ar-001',
  companyId: COMPANY_ID,
  gracePeriodMinutes: 15,
  earlyExitToleranceMinutes: 15,
  halfDayThresholdHours: { toNumber: () => 4 },
  fullDayThresholdHours: { toNumber: () => 8 },
  maxLateCheckInMinutes: 240,
  selfieRequired: false,
  gpsRequired: false,
  punchMode: 'FIRST_LAST',
  workingHoursRounding: 'NONE',
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

const ATTENDANCE_RULES_INPUT: AttendanceRulesInput = {
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

beforeEach(() => {
  mockGetShift.mockResolvedValue(MOCK_SHIFT);
  mockGetLocation.mockResolvedValue(null);
  mockGetRules.mockResolvedValue(MOCK_RULES);
  mockGetBreaks.mockResolvedValue([]);
});

// ─── Full Pipeline: PRESENT scenario ─────────────────────────────────────────

describe('Full attendance pipeline — PRESENT', () => {
  it('should produce PRESENT status for on-time full-day punch', async () => {
    // Step 1: Validate punches
    const punches = [punch('09:00'), punch('17:00')];
    const punchResult = validatePunchSequence(punches, 'FIRST_LAST');

    expect(punchResult.valid).toBe(true);
    expect(punchResult.resolvedIn).not.toBeNull();
    expect(punchResult.resolvedOut).not.toBeNull();

    // Step 2: Resolve policy
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const { policy, trace } = await resolvePolicy(COMPANY_ID, context);

    // Verify trace fields are populated
    expect(trace).toHaveProperty('gracePeriod');
    expect(trace).toHaveProperty('punchMode');

    // Step 3: Resolve status
    const statusResult = resolveAttendanceStatus(
      punchResult.resolvedIn!, punchResult.resolvedOut!,
      { startTime: '09:00', endTime: '17:00', isCrossDay: false },
      policy, context, ATTENDANCE_RULES_INPUT, TZ,
    );

    // Verify all fields needed for AttendanceRecord persistence
    expect(statusResult.status).toBe('PRESENT');
    expect(statusResult.workedHours).toBe(8);
    expect(statusResult.overtimeHours).toBe(0);
    expect(statusResult.isLate).toBe(false);
    expect(statusResult.finalStatusReason).toBeDefined();
    expect(statusResult.appliedLateDeduction).toBeNull();
    expect(statusResult.appliedEarlyExitDeduction).toBeNull();
  });
});

// ─── Full Pipeline: LATE scenario ─────────────────────────────────────────────

describe('Full attendance pipeline — LATE', () => {
  it('should produce LATE status for punch-in 30 min late (beyond 15 min grace)', async () => {
    const punches = [punch('09:30'), punch('17:30')];
    const punchResult = validatePunchSequence(punches, 'FIRST_LAST');

    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const { policy } = await resolvePolicy(COMPANY_ID, context);

    const statusResult = resolveAttendanceStatus(
      punchResult.resolvedIn!, punchResult.resolvedOut!,
      { startTime: '09:00', endTime: '17:00', isCrossDay: false },
      policy, context, ATTENDANCE_RULES_INPUT, TZ,
    );

    expect(statusResult.status).toBe('LATE');
    expect(statusResult.isLate).toBe(true);
    expect(statusResult.lateMinutes).toBe(30);
    expect(statusResult.finalStatusReason).toContain('Late by 30min');
  });
});

// ─── Full Pipeline: with break deduction ─────────────────────────────────────

describe('Full attendance pipeline — break deduction', () => {
  it('should deduct 30 min unpaid break from worked hours', async () => {
    mockGetBreaks.mockResolvedValue([
      { id: 'b1', shiftId: 'shift-001', duration: 30, isPaid: false },
    ]);

    const punches = [punch('09:00'), punch('17:00')];
    const punchResult = validatePunchSequence(punches, 'FIRST_LAST');

    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const { policy, trace } = await resolvePolicy(COMPANY_ID, context);

    expect(policy.breakDeductionMinutes).toBe(30);
    expect(trace.breakDeduction).toBe('SHIFT');

    const statusResult = resolveAttendanceStatus(
      punchResult.resolvedIn!, punchResult.resolvedOut!,
      { startTime: '09:00', endTime: '17:00', isCrossDay: false },
      policy, context, ATTENDANCE_RULES_INPUT, TZ,
    );

    // Raw 8h - 30 min break = 7.5h → HALF_DAY (< fullDayThreshold 8h)
    expect(statusResult.workedHours).toBe(7.5);
    expect(statusResult.status).toBe('HALF_DAY');
  });
});

// ─── Full Pipeline: EVERY_PAIR mode ──────────────────────────────────────────

describe('Full attendance pipeline — EVERY_PAIR punch mode', () => {
  it('should compute correct total worked hours from two IN/OUT pairs', async () => {
    const punches: PunchEntry[] = [
      { time: ist('2026-03-30', '09:00'), direction: 'IN'  },
      { time: ist('2026-03-30', '12:00'), direction: 'OUT' },
      { time: ist('2026-03-30', '13:00'), direction: 'IN'  },
      { time: ist('2026-03-30', '18:00'), direction: 'OUT' },
    ];
    const punchResult = validatePunchSequence(punches, 'EVERY_PAIR');

    expect(punchResult.valid).toBe(true);
    expect(punchResult.totalWorkedMinutes).toBe(480); // 3h + 5h = 8h

    // The status resolver uses resolvedIn/Out for timing, not totalWorkedMinutes
    // so we verify the pipeline still produces correct status
    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: false,
      isWeekOff: false,
    };
    const { policy } = await resolvePolicy(COMPANY_ID, context);

    const statusResult = resolveAttendanceStatus(
      punchResult.resolvedIn!, punchResult.resolvedOut!,
      { startTime: '09:00', endTime: '18:00', isCrossDay: false },
      { ...policy, fullDayThresholdHours: 8 },
      context, ATTENDANCE_RULES_INPUT, TZ,
    );

    expect(statusResult.workedHours).toBe(9); // 09:00 to 18:00 raw
    expect(statusResult.status).toBe('PRESENT');
  });
});

// ─── Full Pipeline: Holiday scenario ─────────────────────────────────────────

describe('Full attendance pipeline — holiday', () => {
  it('should produce HOLIDAY status with OT hours when worked on a holiday', async () => {
    const punches = [punch('09:00'), punch('19:00')]; // 10h on holiday
    const punchResult = validatePunchSequence(punches, 'FIRST_LAST');

    const context: EvaluationContext = {
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      locationId: null,
      date: new Date('2026-03-30'),
      isHoliday: true,
      isWeekOff: false,
      holidayName: 'Ram Navami',
    };
    const { policy } = await resolvePolicy(COMPANY_ID, context);

    const statusResult = resolveAttendanceStatus(
      punchResult.resolvedIn!, punchResult.resolvedOut!,
      { startTime: '09:00', endTime: '17:00', isCrossDay: false },
      policy, context, ATTENDANCE_RULES_INPUT, TZ,
    );

    expect(statusResult.status).toBe('HOLIDAY');
    expect(statusResult.workedHours).toBe(10);
    expect(statusResult.overtimeHours).toBe(2);
    expect(statusResult.finalStatusReason).toContain('Ram Navami');
  });
});
