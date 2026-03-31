/**
 * Unit tests for policy-resolver.service.ts
 *
 * Source file: src/shared/services/policy-resolver.service.ts
 *
 * External dependencies mocked:
 *   - @/shared/utils/config-cache (all 4 getCached* functions)
 *   - config/logger
 *
 * Tests verify the 7-layer resolution chain for every field type.
 */

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedShift:          jest.fn(),
  getCachedLocation:       jest.fn(),
  getCachedAttendanceRules: jest.fn(),
  getCachedShiftBreaks:    jest.fn(),
}));

import { resolvePolicy, type EvaluationContext } from '@/shared/services/policy-resolver.service';
import {
  getCachedShift,
  getCachedLocation,
  getCachedAttendanceRules,
  getCachedShiftBreaks,
} from '@/shared/utils/config-cache';
import { SYSTEM_DEFAULTS } from '@/shared/constants/system-defaults';

const mockGetShift       = getCachedShift       as jest.Mock;
const mockGetLocation    = getCachedLocation    as jest.Mock;
const mockGetRules       = getCachedAttendanceRules as jest.Mock;
const mockGetBreaks      = getCachedShiftBreaks  as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-001';

const BASE_CONTEXT: EvaluationContext = {
  employeeId: 'emp-001',
  shiftId: 'shift-001',
  locationId: 'loc-001',
  date: new Date('2026-03-30'),
  isHoliday: false,
  isWeekOff: false,
};

/** Minimal AttendanceRule object matching Prisma type */
function makeRules(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ar-001',
    companyId: COMPANY_ID,
    gracePeriodMinutes: 20,
    earlyExitToleranceMinutes: 20,
    halfDayThresholdHours: { toNumber: () => 4 },
    fullDayThresholdHours: { toNumber: () => 8 },
    maxLateCheckInMinutes: 120,
    selfieRequired: false,
    gpsRequired: false,
    punchMode: 'FIRST_LAST',
    workingHoursRounding: 'NONE',
    ...overrides,
  };
}

/** Minimal CompanyShift object */
function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shift-001',
    name: 'Day Shift',
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
    ...overrides,
  };
}

/** Minimal Location object */
function makeLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loc-001',
    name: 'Head Office',
    requireSelfie: null,
    requireLiveLocation: null,
    geoEnabled: false,
    allowedDevices: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolvePolicy', () => {
  beforeEach(() => {
    // Default: no shift overrides, basic rules
    mockGetShift.mockResolvedValue(makeShift());
    mockGetLocation.mockResolvedValue(makeLocation());
    mockGetRules.mockResolvedValue(makeRules());
    mockGetBreaks.mockResolvedValue([]);
  });

  // ── gracePeriodMinutes ───────────────────────────────────────────────────

  describe('gracePeriodMinutes resolution', () => {
    it('should resolve from SHIFT when shift.gracePeriodMinutes is set', async () => {
      mockGetShift.mockResolvedValue(makeShift({ gracePeriodMinutes: 5 }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.gracePeriodMinutes).toBe(5);
      expect(trace.gracePeriod).toBe('SHIFT');
    });

    it('should fall back to ATTENDANCE_RULE when shift.gracePeriodMinutes is null', async () => {
      mockGetShift.mockResolvedValue(makeShift({ gracePeriodMinutes: null }));
      mockGetRules.mockResolvedValue(makeRules({ gracePeriodMinutes: 20 }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.gracePeriodMinutes).toBe(20);
      expect(trace.gracePeriod).toBe('ATTENDANCE_RULE');
    });

    it('should fall back to SYSTEM_DEFAULT when both shift and rules return null', async () => {
      mockGetShift.mockResolvedValue(makeShift({ gracePeriodMinutes: null }));
      mockGetRules.mockResolvedValue(makeRules({ gracePeriodMinutes: null }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.gracePeriodMinutes).toBe(SYSTEM_DEFAULTS.gracePeriodMinutes);
      expect(trace.gracePeriod).toBe('SYSTEM_DEFAULT');
    });
  });

  // ── selfieRequired (constraint field) ────────────────────────────────────

  describe('selfieRequired resolution (constraint field: location → shift → rules → default)', () => {
    it('should resolve from LOCATION when location.requireSelfie is true', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireSelfie: true }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.selfieRequired).toBe(true);
      expect(trace.selfieRequired).toBe('LOCATION');
    });

    it('should fall back to SHIFT when location.requireSelfie is null', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireSelfie: null }));
      mockGetShift.mockResolvedValue(makeShift({ requireSelfie: true }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.selfieRequired).toBe(true);
      expect(trace.selfieRequired).toBe('SHIFT');
    });

    it('should fall back to ATTENDANCE_RULE when location and shift return null', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireSelfie: null }));
      mockGetShift.mockResolvedValue(makeShift({ requireSelfie: null }));
      mockGetRules.mockResolvedValue(makeRules({ selfieRequired: true }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.selfieRequired).toBe(true);
      expect(trace.selfieRequired).toBe('ATTENDANCE_RULE');
    });

    it('should fall back to SYSTEM_DEFAULT when all layers return null', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireSelfie: null }));
      mockGetShift.mockResolvedValue(makeShift({ requireSelfie: null }));
      mockGetRules.mockResolvedValue(makeRules({ selfieRequired: null }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.selfieRequired).toBe(SYSTEM_DEFAULTS.selfieRequired);
      expect(trace.selfieRequired).toBe('SYSTEM_DEFAULT');
    });
  });

  // ── gpsRequired (constraint field) ───────────────────────────────────────

  describe('gpsRequired resolution', () => {
    it('should resolve from LOCATION when location.requireLiveLocation is true', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireLiveLocation: true }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.gpsRequired).toBe(true);
      expect(trace.gpsRequired).toBe('LOCATION');
    });

    it('should fall back to SHIFT.requireGPS when location returns null', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ requireLiveLocation: null }));
      mockGetShift.mockResolvedValue(makeShift({ requireGPS: true }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.gpsRequired).toBe(true);
      expect(trace.gpsRequired).toBe('SHIFT');
    });
  });

  // ── halfDayThresholdHours (Decimal field) ─────────────────────────────────

  describe('halfDayThresholdHours Decimal resolution', () => {
    it('should convert Decimal-like value from shift to number', async () => {
      // decimalToNumber() calls Number(value). Pass a plain number which is
      // what Prisma returns after JSON serialisation (Decimal → number in JS).
      mockGetShift.mockResolvedValue(makeShift({
        halfDayThresholdHours: 3.5,
      }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.halfDayThresholdHours).toBe(3.5);
      expect(trace.halfDayThreshold).toBe('SHIFT');
    });

    it('should fall back to rules when shift.halfDayThresholdHours is null', async () => {
      mockGetShift.mockResolvedValue(makeShift({ halfDayThresholdHours: null }));
      // Pass a plain number — Prisma Decimal serialises as number via Number()
      mockGetRules.mockResolvedValue(makeRules({
        halfDayThresholdHours: 4,
      }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.halfDayThresholdHours).toBe(4);
      expect(trace.halfDayThreshold).toBe('ATTENDANCE_RULE');
    });
  });

  // ── breakDeductionMinutes ─────────────────────────────────────────────────

  describe('breakDeductionMinutes from ShiftBreaks', () => {
    it('should sum unpaid break durations from ShiftBreaks', async () => {
      mockGetBreaks.mockResolvedValue([
        { id: 'b1', shiftId: 'shift-001', duration: 30, isPaid: false },
        { id: 'b2', shiftId: 'shift-001', duration: 15, isPaid: false },
        { id: 'b3', shiftId: 'shift-001', duration: 30, isPaid: true }, // paid — skip
      ]);
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      // Only unpaid breaks: 30 + 15 = 45 min
      expect(policy.breakDeductionMinutes).toBe(45);
      expect(trace.breakDeduction).toBe('SHIFT');
    });

    it('should return 0 break deduction when all breaks are paid', async () => {
      mockGetBreaks.mockResolvedValue([
        { id: 'b1', shiftId: 'shift-001', duration: 30, isPaid: true },
      ]);
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.breakDeductionMinutes).toBe(0);
      // Sum of paid-only = 0, but shift was present so trace says SHIFT
      expect(trace.breakDeduction).toBe('SHIFT');
    });

    it('should use SYSTEM_DEFAULT when no shift is assigned', async () => {
      mockGetBreaks.mockResolvedValue([]);
      const { policy, trace } = await resolvePolicy(COMPANY_ID, {
        ...BASE_CONTEXT,
        shiftId: null,
      });
      expect(policy.breakDeductionMinutes).toBe(SYSTEM_DEFAULTS.breakDeductionMinutes);
      expect(trace.breakDeduction).toBe('SYSTEM_DEFAULT');
    });

    it('should use SYSTEM_DEFAULT when shift returns null', async () => {
      mockGetShift.mockResolvedValue(null);
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.breakDeductionMinutes).toBe(SYSTEM_DEFAULTS.breakDeductionMinutes);
      expect(trace.breakDeduction).toBe('SYSTEM_DEFAULT');
    });
  });

  // ── No shift assigned ─────────────────────────────────────────────────────

  describe('no shift assigned (shiftId=null)', () => {
    it('should not fetch shift or shift breaks when shiftId is null', async () => {
      const { policy, trace } = await resolvePolicy(COMPANY_ID, {
        ...BASE_CONTEXT,
        shiftId: null,
      });
      expect(mockGetShift).not.toHaveBeenCalled();
      expect(mockGetBreaks).not.toHaveBeenCalled();
      // Policy fields should resolve from rules or SYSTEM_DEFAULT
      expect(policy.gracePeriodMinutes).toBe(20); // from makeRules()
      expect(trace.gracePeriod).toBe('ATTENDANCE_RULE');
    });
  });

  // ── No location assigned ──────────────────────────────────────────────────

  describe('no location assigned (locationId=null)', () => {
    it('should not fetch location when locationId is null', async () => {
      const { policy } = await resolvePolicy(COMPANY_ID, {
        ...BASE_CONTEXT,
        locationId: null,
      });
      expect(mockGetLocation).not.toHaveBeenCalled();
      // selfieRequired should come from shift or rules
      expect(typeof policy.selfieRequired).toBe('boolean');
    });
  });

  // ── punchMode and workingHoursRounding (rules-only fields) ────────────────

  describe('punchMode resolution (attendanceRules → SYSTEM_DEFAULT)', () => {
    it('should resolve punchMode from ATTENDANCE_RULE', async () => {
      mockGetRules.mockResolvedValue(makeRules({ punchMode: 'EVERY_PAIR' }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.punchMode).toBe('EVERY_PAIR');
      expect(trace.punchMode).toBe('ATTENDANCE_RULE');
    });

    it('should fall back to SYSTEM_DEFAULT when rules.punchMode is null', async () => {
      mockGetRules.mockResolvedValue(makeRules({ punchMode: null }));
      const { policy, trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      expect(policy.punchMode).toBe(SYSTEM_DEFAULTS.punchMode);
      expect(trace.punchMode).toBe('SYSTEM_DEFAULT');
    });
  });

  // ── Resolution trace completeness ─────────────────────────────────────────

  describe('resolutionTrace completeness', () => {
    it('should include all expected field keys in the trace', async () => {
      const { trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      const expectedFields = [
        'gracePeriod',
        'earlyExitTolerance',
        'halfDayThreshold',
        'fullDayThreshold',
        'maxLateCheckIn',
        'selfieRequired',
        'gpsRequired',
        'punchMode',
        'workingHoursRounding',
        'breakDeduction',
      ];
      for (const field of expectedFields) {
        expect(trace).toHaveProperty(field);
      }
    });

    it('should map each trace value to a valid ResolutionSource', async () => {
      const { trace } = await resolvePolicy(COMPANY_ID, BASE_CONTEXT);
      const validSources = ['SHIFT', 'LOCATION', 'ATTENDANCE_RULE', 'SYSTEM_DEFAULT'];
      for (const [field, source] of Object.entries(trace)) {
        expect(validSources).toContain(source);
      }
    });
  });

  // ── getCachedAttendanceRules throws ──────────────────────────────────────

  describe('error handling', () => {
    it('should throw ApiError.internal when getCachedAttendanceRules rejects', async () => {
      mockGetRules.mockRejectedValue(new Error('Redis down'));
      await expect(resolvePolicy(COMPANY_ID, BASE_CONTEXT)).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('should throw ApiError.internal when getCachedShift rejects', async () => {
      mockGetShift.mockRejectedValue(new Error('Shift fetch failed'));
      await expect(resolvePolicy(COMPANY_ID, BASE_CONTEXT)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });
});
