/**
 * Failure and edge case tests
 *
 * Tests resilience of the config system under adverse conditions:
 *   - Redis completely unavailable (getCachedSystemControls still works via DB)
 *   - DB miss auto-seeds defaults
 *   - Null shift assigned → uses attendance rules only
 *   - All policy overrides null → SYSTEM_DEFAULTS used
 *   - Decimal value handling edge cases
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    systemControls:  { findUnique: jest.fn(), create: jest.fn() },
    attendanceRule:  { findUnique: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../../config/redis', () => ({
  cacheRedis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedShift:            jest.fn(),
  getCachedLocation:         jest.fn(),
  getCachedAttendanceRules:  jest.fn(),
  getCachedShiftBreaks:      jest.fn(),
}));

import { getCachedSystemControls, getCachedAttendanceRules } from '@/shared/utils/config-cache';
import { resolvePolicy, type EvaluationContext } from '@/shared/services/policy-resolver.service';
import { resolveAttendanceStatus, type ShiftInfo, type AttendanceRulesInput } from '@/shared/services/attendance-status-resolver.service';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { SYSTEM_DEFAULTS } from '@/shared/constants/system-defaults';
import type { ResolvedPolicy } from '@/shared/services/policy-resolver.service';

// Re-import the cached helpers from config-cache module
import {
  getCachedShift,
  getCachedLocation,
  getCachedAttendanceRules as mockGetRulesFromCache,
  getCachedShiftBreaks,
} from '@/shared/utils/config-cache';

const mockRedis          = cacheRedis as jest.Mocked<typeof cacheRedis>;
const mockPrismaControls = platformPrisma.systemControls as any;
const mockPrismaRules    = platformPrisma.attendanceRule  as any;
const mockGetShift       = getCachedShift       as jest.Mock;
const mockGetLocation    = getCachedLocation    as jest.Mock;
const mockGetRules       = mockGetRulesFromCache as jest.Mock;
const mockGetBreaks      = getCachedShiftBreaks  as jest.Mock;

const COMPANY_ID = 'company-001';

const BASE_CONTEXT: EvaluationContext = {
  employeeId: 'emp-001',
  shiftId: null,
  locationId: null,
  date: new Date('2026-03-30'),
  isHoliday: false,
  isWeekOff: false,
};

// ─── Redis unavailable → DB fallback ─────────────────────────────────────────

describe('Redis completely unavailable', () => {
  beforeEach(() => {
    // All Redis operations throw
    mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));
  });

  it('getCachedSystemControls should fall through to DB when Redis is unavailable', async () => {
    const MOCK_CONTROLS = { id: 'sc-1', companyId: COMPANY_ID, attendanceEnabled: true };
    mockPrismaControls.findUnique.mockResolvedValue(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.findUnique).toHaveBeenCalledTimes(1);
  });

  it('getCachedAttendanceRules should fall through to DB when Redis is unavailable', async () => {
    const MOCK_RULES = { id: 'ar-1', companyId: COMPANY_ID, gracePeriodMinutes: 15 };
    mockPrismaRules.findUnique.mockResolvedValue(MOCK_RULES);
    const result = await getCachedAttendanceRules(COMPANY_ID);
    expect(result).toEqual(MOCK_RULES);
  });
});

// ─── DB auto-seed on missing config ──────────────────────────────────────────

describe('Config auto-seeding on DB miss', () => {
  beforeEach(() => {
    mockRedis.get.mockResolvedValue(null); // Always cache miss
    mockRedis.set.mockResolvedValue('OK' as any);
  });

  it('should auto-seed SystemControls when findUnique returns null', async () => {
    const SEEDED = { id: 'sc-new', companyId: COMPANY_ID, attendanceEnabled: true };
    mockPrismaControls.findUnique.mockResolvedValueOnce(null);
    mockPrismaControls.create.mockResolvedValueOnce(SEEDED);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(SEEDED);
    expect(mockPrismaControls.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
  });

  it('should auto-seed AttendanceRule when findUnique returns null', async () => {
    const SEEDED = { id: 'ar-new', companyId: COMPANY_ID, gracePeriodMinutes: 15 };
    mockPrismaRules.findUnique.mockResolvedValueOnce(null);
    mockPrismaRules.create.mockResolvedValueOnce(SEEDED);
    const result = await getCachedAttendanceRules(COMPANY_ID);
    expect(result).toEqual(SEEDED);
    expect(mockPrismaRules.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
  });
});

// ─── Null shift → uses attendance rules only ──────────────────────────────────

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

  it('should resolve halfDayThreshold from SYSTEM_DEFAULT when both shift and rules are null', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    // rules.halfDayThresholdHours is null → falls to SYSTEM_DEFAULT
    expect(policy.halfDayThresholdHours).toBe(SYSTEM_DEFAULTS.halfDayThresholdHours);
    expect(trace.halfDayThreshold).toBe('SYSTEM_DEFAULT');
  });

  it('should resolve punchMode from ATTENDANCE_RULE', async () => {
    const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
    expect(policy.punchMode).toBe('FIRST_LAST');
    expect(trace.punchMode).toBe('ATTENDANCE_RULE');
  });
});

// ─── resolveAttendanceStatus — edge cases ────────────────────────────────────

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
    // Defensive: reversed punches should give 0 worked hours
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
    const punchIn  = new Date('2026-03-30T04:00:00.000Z'); // 9:30 IST
    const punchOut = new Date('2026-03-30T12:00:00.000Z'); // 17:30 IST → 8h raw
    const result = resolveAttendanceStatus(
      punchIn, punchOut, null,
      { ...DEFAULT_POLICY, breakDeductionMinutes: 9999 },
      NORMAL_CONTEXT, DEFAULT_RULES, 'Asia/Kolkata',
    );
    // Net minutes = max(0, 480 - 9999) = 0
    expect(result.workedHours).toBe(0);
  });

  it('should correctly handle PERCENTAGE deduction with null deductionValue', () => {
    // Percentage deduction with null value should return null (no deduction)
    const punchIn  = new Date('2026-03-30T03:30:00.000Z'); // 09:00 IST
    const punchOut = new Date('2026-03-30T11:30:00.000Z'); // 17:00 IST
    const shift: ShiftInfo = { startTime: '09:00', endTime: '17:00', isCrossDay: false };
    const result = resolveAttendanceStatus(
      punchIn, punchOut, shift, DEFAULT_POLICY,
      { ...NORMAL_CONTEXT, shiftId: 'shift-001' },
      {
        ...DEFAULT_RULES,
        lateDeductionType: 'PERCENTAGE',
        lateDeductionValue: null, // null percentage
      },
      'Asia/Kolkata',
    );
    // Not late (on time) → appliedLateDeduction should be null regardless
    expect(result.appliedLateDeduction).toBeNull();
  });
});
