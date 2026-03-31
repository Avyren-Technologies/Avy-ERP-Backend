/**
 * Unit tests for OvertimeRule calculation logic
 *
 * Source file: src/shared/services/attendance-status-resolver.service.ts
 * (overtime hours are computed inside resolveAttendanceStatus)
 *
 * These tests exercise the OT calculation sub-system by running the full
 * status resolver with controlled inputs that trigger overtime paths.
 * They also test the SYSTEM_DEFAULTS OT configuration values.
 *
 * Separate OT-specific logic tests (multipliers, caps, comp-off) are
 * documented here for when a dedicated OvertimeCalculator service is
 * extracted in a future sprint.
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
import { SYSTEM_DEFAULTS } from '@/shared/constants/system-defaults';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TZ = 'Asia/Kolkata';

const DAY_SHIFT: ShiftInfo = { startTime: '09:00', endTime: '17:00', isCrossDay: false };

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
  shiftId: 'shift-001',
  locationId: null,
  date: new Date('2026-03-30'),
  isHoliday: false,
  isWeekOff: false,
};

/** Build a punch in IST from HH:mm on a given date */
function ist(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y!, mo! - 1, d!, (h ?? 0) - 5, (m ?? 0) - 30, 0, 0);
  return new Date(utcMs);
}

// ─── OT calculation via status resolver ──────────────────────────────────────

describe('Overtime calculation in resolveAttendanceStatus', () => {
  it('should return 0 OT when worked exactly fullDayThreshold (8h)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '17:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ,
    );
    expect(result.overtimeHours).toBe(0);
    expect(result.workedHours).toBe(8);
  });

  it('should return 1h OT when worked 9h (fullDayThreshold=8h)', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '18:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ,
    );
    expect(result.overtimeHours).toBe(1);
  });

  it('should return 3h OT when worked 11h', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '20:00');
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ,
    );
    expect(result.overtimeHours).toBe(3);
  });

  it('should return 0 OT when worked less than fullDayThreshold', () => {
    const punchIn  = ist('2026-03-30', '09:00');
    const punchOut = ist('2026-03-30', '14:00'); // 5h
    const result = resolveAttendanceStatus(
      punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
      NORMAL_CONTEXT, DEFAULT_RULES, TZ,
    );
    expect(result.overtimeHours).toBe(0);
  });

  describe('OT on holiday', () => {
    it('should compute OT hours when worked beyond fullDayThreshold on a holiday', () => {
      const punchIn  = ist('2026-03-30', '09:00');
      const punchOut = ist('2026-03-30', '20:00'); // 11h
      const result = resolveAttendanceStatus(
        punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
        { ...NORMAL_CONTEXT, isHoliday: true },
        DEFAULT_RULES, TZ,
      );
      expect(result.status).toBe('HOLIDAY');
      expect(result.overtimeHours).toBe(3);
    });

    it('should report 0 OT when worked exactly fullDayThreshold on a holiday', () => {
      const punchIn  = ist('2026-03-30', '09:00');
      const punchOut = ist('2026-03-30', '17:00'); // exactly 8h
      const result = resolveAttendanceStatus(
        punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
        { ...NORMAL_CONTEXT, isHoliday: true },
        DEFAULT_RULES, TZ,
      );
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe('OT on week off', () => {
    it('should compute OT hours when worked beyond fullDayThreshold on a week off', () => {
      const punchIn  = ist('2026-03-30', '09:00');
      const punchOut = ist('2026-03-30', '19:00'); // 10h
      const result = resolveAttendanceStatus(
        punchIn, punchOut, DAY_SHIFT, DEFAULT_POLICY,
        { ...NORMAL_CONTEXT, isWeekOff: true },
        DEFAULT_RULES, TZ,
      );
      expect(result.status).toBe('WEEK_OFF');
      expect(result.overtimeHours).toBe(2);
    });
  });

  describe('OT rounding', () => {
    it('should apply NEAREST_15 rounding to OT hours', () => {
      const punchIn  = ist('2026-03-30', '09:00');
      const punchOut = ist('2026-03-30', '17:22'); // 8h22m = 8.367h
      // NEAREST_15: 8.367 → rounds to 8.25 (nearest 15 min)
      // OT: 8.25 - 8 = 0.25h
      const result = resolveAttendanceStatus(
        punchIn, punchOut, DAY_SHIFT,
        { ...DEFAULT_POLICY, workingHoursRounding: 'NEAREST_15' },
        NORMAL_CONTEXT, DEFAULT_RULES, TZ,
      );
      // workedHours after NEAREST_15 rounding of 8.367: 8.367*4 = 33.47 → round to 33 → 33/4 = 8.25
      expect(result.workedHours).toBe(8.25);
      expect(result.overtimeHours).toBeCloseTo(0.25, 5);
    });
  });
});

// ─── SYSTEM_DEFAULTS OT configuration ────────────────────────────────────────

describe('SYSTEM_DEFAULTS OT configuration', () => {
  it('should have minimumOtMinutes = 30', () => {
    expect(SYSTEM_DEFAULTS.minimumOtMinutes).toBe(30);
  });

  it('should have thresholdMinutes = 30', () => {
    expect(SYSTEM_DEFAULTS.thresholdMinutes).toBe(30);
  });

  it('should have weekdayMultiplier = 1.5', () => {
    expect(SYSTEM_DEFAULTS.weekdayMultiplier).toBe(1.5);
  });

  it('should default approvalRequired to true', () => {
    expect(SYSTEM_DEFAULTS.approvalRequired).toBe(true);
  });

  it('should default autoIncludePayroll to false', () => {
    expect(SYSTEM_DEFAULTS.autoIncludePayroll).toBe(false);
  });

  it('should default compOffEnabled to false', () => {
    expect(SYSTEM_DEFAULTS.compOffEnabled).toBe(false);
  });

  it('should default enforceCaps to false', () => {
    expect(SYSTEM_DEFAULTS.enforceCaps).toBe(false);
  });

  it('should default calculationBasis to AFTER_SHIFT', () => {
    expect(SYSTEM_DEFAULTS.calculationBasis).toBe('AFTER_SHIFT');
  });

  it('should have valid roundingStrategy enum value', () => {
    const validStrategies = ['NONE', 'NEAREST_15', 'NEAREST_30', 'FLOOR_15', 'CEIL_15'];
    expect(validStrategies).toContain(SYSTEM_DEFAULTS.roundingStrategy);
  });
});

// ─── Manufacturing OT template validation ────────────────────────────────────

describe('Manufacturing OT template values', () => {
  const { getIndustryDefaults } = require('@/shared/constants/system-defaults');

  it('should have enforceCaps=true for Manufacturing', () => {
    const d = getIndustryDefaults('MANUFACTURING');
    expect(d.overtimeRules.enforceCaps).toBe(true);
  });

  it('should have holidayMultiplier=2.0 for Manufacturing', () => {
    const d = getIndustryDefaults('MANUFACTURING');
    expect(d.overtimeRules.holidayMultiplier).toBe(2.0);
  });

  it('should have compOffEnabled=true for Manufacturing', () => {
    const d = getIndustryDefaults('MANUFACTURING');
    expect(d.overtimeRules.compOffEnabled).toBe(true);
  });

  it('should have dailyCapHours=4 for Manufacturing', () => {
    const d = getIndustryDefaults('MANUFACTURING');
    expect(d.overtimeRules.dailyCapHours).toBe(4);
  });
});
