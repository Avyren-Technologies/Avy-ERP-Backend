/**
 * Failure and edge case tests
 *
 * Tests resilience of the config system under adverse conditions:
 *   - Null shift assigned → policy uses attendance rules only
 *   - All policy overrides null → SYSTEM_DEFAULTS used
 *   - Decimal/edge value handling in resolveAttendanceStatus
 *
 * Redis/DB fallback tests (getCachedSystemControls, getCachedAttendanceRules)
 * are in config-cache-fallback.test.ts — they require the real cache
 * implementations and cannot share a file that mocks the config-cache module.
 *
 * Architecture:
 *   config-cache is mocked entirely so that resolvePolicy's getCached* calls
 *   return controlled fixtures. resolveAttendanceStatus is pure — no mocking needed.
 */

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedShift:           jest.fn(),
  getCachedLocation:        jest.fn(),
  getCachedAttendanceRules: jest.fn(),
  getCachedShiftBreaks:     jest.fn(),
}));

import { resolvePolicy, type EvaluationContext } from '@/shared/services/policy-resolver.service';
import {
  resolveAttendanceStatus,
  type ShiftInfo,
  type AttendanceRulesInput,
} from '@/shared/services/attendance-status-resolver.service';
import {
  getCachedShift,
  getCachedLocation,
  getCachedAttendanceRules,
  getCachedShiftBreaks,
} from '@/shared/utils/config-cache';
import { SYSTEM_DEFAULTS } from '@/shared/constants/system-defaults';
import type { ResolvedPolicy } from '@/shared/services/policy-resolver.service';

const mockGetShift    = getCachedShift           as jest.Mock;
const mockGetLocation = getCachedLocation        as jest.Mock;
const mockGetRules    = getCachedAttendanceRules  as jest.Mock;
const mockGetBreaks   = getCachedShiftBreaks      as jest.Mock;

const COMPANY_ID = 'company-001';

const BASE_CONTEXT: EvaluationContext = {
  employeeId: 'emp-001',
  shiftId: null,
  locationId: null,
  date: new Date('2026-03-30'),
  isHoliday: false,
  isWeekOff: false,
};

// ─── 1. Null shift → uses attendance rules only ───────────────────────────────

describe('resolvePolicy — null shiftId falls back to attendance rules', () => {
  beforeEach(() => {
    mockGetShift.mockResolvedValue(null);
    mockGetLocation.mockResolvedValue(null);
    mockGetBreaks.mockResolvedValue([]);
    mockGetRules.mockResolvedValue({
      id: 'ar-1',
      companyId: COMPANY_ID,
      gracePeriodMinutes: 20,
      earlyExitToleranceMinutes: 20,
      halfDayThresholdHours: null,
      fullDayThresholdHours: null,
      maxLateCheckInMinutes: 120,
      selfieRequired: false,
      gpsRequired: false,
      punchMode: 'FIRST_LAST',
      workingHoursRounding: 'NONE',
    });
  });

  it('should resolve gracePeriod from ATTENDANCE_RULE when no shift is assigned', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.gracePeriodMinutes).toBe(20);
    expect(trace.gracePeriod).toBe('ATTENDANCE_RULE');
  });

  it('should resolve halfDayThreshold from SYSTEM_DEFAULT when both shift and rules return null', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.halfDayThresholdHours).toBe(SYSTEM_DEFAULTS.halfDayThresholdHours);
    expect(trace.halfDayThreshold).toBe('SYSTEM_DEFAULT');
  });

  it('should resolve punchMode from ATTENDANCE_RULE', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.punchMode).toBe('FIRST_LAST');
    expect(trace.punchMode).toBe('ATTENDANCE_RULE');
  });
});

// ─── 2. resolveAttendanceStatus — edge cases ──────────────────────────────────

describe('resolveAttendanceStatus — edge cases', () => {
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

  const NORMAL_CONTEXT: EvaluationContext = {
    employeeId: 'emp-001',
    shiftId: null,
    locationId: null,
    date: new Date('2026-03-30'),
    isHoliday: false,
    isWeekOff: false,
  };

  it('should not produce negative workedHours when punchOut is before punchIn', () => {
    const punchIn  = new Date('2026-03-30T12:00:00.000Z');
    const punchOut = new Date('2026-03-30T09:00:00.000Z'); // before punchIn
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, 'Asia/Kolkata',
    );
    expect(result.workedHours).toBeGreaterThanOrEqual(0);
  });

  it('should handle exactly zero worked hours (same in/out timestamp)', () => {
    const ts = new Date('2026-03-30T09:00:00.000Z');
    const result = resolveAttendanceStatus(
      ts, ts, null, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, 'Asia/Kolkata',
    );
    expect(result.workedHours).toBe(0);
  });

  it('should return LOP when workedHours=0 and lopAutoDeduct=true', () => {
    const ts = new Date('2026-03-30T09:00:00.000Z');
    const result = resolveAttendanceStatus(
      ts, ts, null, DEFAULT_POLICY,
      NORMAL_CONTEXT,
      { ...DEFAULT_RULES, lopAutoDeduct: true, autoHalfDayEnabled: false },
      'Asia/Kolkata',
    );
    expect(result.status).toBe('LOP');
  });

  it('should handle very large breakDeductionMinutes without crashing', () => {
    const punchIn  = new Date('2026-03-30T04:00:00.000Z');
    const punchOut = new Date('2026-03-30T12:00:00.000Z');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null,
      { ...DEFAULT_POLICY, breakDeductionMinutes: 9999 },
      NORMAL_CONTEXT, DEFAULT_RULES, 'Asia/Kolkata',
    );
    expect(result.workedHours).toBe(0);
  });

  it('should return null appliedLateDeduction when not late', () => {
    // 09:00 IST punchIn = 03:30 UTC; shift starts 09:00 in IST
    const punchIn  = new Date('2026-03-30T03:30:00.000Z');
    const punchOut = new Date('2026-03-30T11:30:00.000Z');
    const shift: ShiftInfo = { startTime: '09:00', endTime: '17:00', isCrossDay: false };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, shift, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, shiftId: 'shift-001' },
      {
        ...DEFAULT_RULES,
        lateDeductionType: 'PERCENTAGE',
        lateDeductionValue: null,
      },
      'Asia/Kolkata',
    );
    // On time → not late → deduction should be null
    expect(result.appliedLateDeduction).toBeNull();
  });
});

// ─── 3. All policy sources null → SYSTEM_DEFAULTS ────────────────────────────

describe('resolvePolicy — all overrides null → SYSTEM_DEFAULTS', () => {
  beforeEach(() => {
    mockGetShift.mockResolvedValue(null);
    mockGetLocation.mockResolvedValue(null);
    mockGetBreaks.mockResolvedValue([]);
    // Attendance rules with all nullable fields set to null
    mockGetRules.mockResolvedValue({
      id: 'ar-1',
      companyId: COMPANY_ID,
      gracePeriodMinutes: null,
      earlyExitToleranceMinutes: null,
      halfDayThresholdHours: null,
      fullDayThresholdHours: null,
      maxLateCheckInMinutes: null,
      selfieRequired: null,
      gpsRequired: null,
      punchMode: null,
      workingHoursRounding: null,
    });
  });

  it('should fall back to SYSTEM_DEFAULT for gracePeriod when all sources are null', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.gracePeriodMinutes).toBe(SYSTEM_DEFAULTS.gracePeriodMinutes);
    expect(trace.gracePeriod).toBe('SYSTEM_DEFAULT');
  });

  it('should fall back to SYSTEM_DEFAULT for punchMode when all sources are null', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.punchMode).toBe(SYSTEM_DEFAULTS.punchMode);
    expect(trace.punchMode).toBe('SYSTEM_DEFAULT');
  });

  it('should fall back to SYSTEM_DEFAULT for selfieRequired when all sources are null', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.selfieRequired).toBe(SYSTEM_DEFAULTS.selfieRequired);
    expect(trace.selfieRequired).toBe('SYSTEM_DEFAULT');
  });
});
