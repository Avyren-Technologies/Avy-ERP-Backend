/**
 * Unit tests for system-defaults.ts
 *
 * Source file: src/shared/constants/system-defaults.ts
 *
 * Tests:
 *   - SYSTEM_DEFAULTS completeness and valid enum values
 *   - getIndustryDefaults() for every industry type
 *   - Fallback to DEFAULT_TEMPLATE for unknown/missing industry
 *   - Fuzzy match logic (software → IT, hospital → HEALTHCARE, etc.)
 */

import { SYSTEM_DEFAULTS, getIndustryDefaults } from '@/shared/constants/system-defaults';

// ─── SYSTEM_DEFAULTS ─────────────────────────────────────────────────────────

describe('SYSTEM_DEFAULTS', () => {
  it('should define all policy fields with sensible values', () => {
    expect(SYSTEM_DEFAULTS.gracePeriodMinutes).toBe(15);
    expect(SYSTEM_DEFAULTS.earlyExitToleranceMinutes).toBe(15);
    expect(SYSTEM_DEFAULTS.maxLateCheckInMinutes).toBe(240);
    expect(SYSTEM_DEFAULTS.halfDayThresholdHours).toBe(4);
    expect(SYSTEM_DEFAULTS.fullDayThresholdHours).toBe(8);
  });

  it('should have valid PunchMode enum value', () => {
    const validPunchModes = ['FIRST_LAST', 'EVERY_PAIR', 'SHIFT_BASED'];
    expect(validPunchModes).toContain(SYSTEM_DEFAULTS.punchMode);
  });

  it('should have valid RoundingStrategy enum values for workingHoursRounding', () => {
    const validStrategies = ['NONE', 'NEAREST_15', 'NEAREST_30', 'FLOOR_15', 'CEIL_15'];
    expect(validStrategies).toContain(SYSTEM_DEFAULTS.workingHoursRounding);
  });

  it('should have valid punchTimeRounding enum value', () => {
    const validValues = ['NONE', 'NEAREST_5', 'NEAREST_15'];
    expect(validValues).toContain(SYSTEM_DEFAULTS.punchTimeRounding);
  });

  it('should have valid DeductionType enum values', () => {
    const validDeductions = ['NONE', 'HALF_DAY_AFTER_LIMIT', 'PERCENTAGE'];
    expect(validDeductions).toContain(SYSTEM_DEFAULTS.lateDeductionType);
    expect(validDeductions).toContain(SYSTEM_DEFAULTS.earlyExitDeductionType);
  });

  it('should have valid calculationBasis enum value for OT', () => {
    const validBases = ['AFTER_SHIFT', 'TOTAL_HOURS'];
    expect(validBases).toContain(SYSTEM_DEFAULTS.calculationBasis);
  });

  it('should default break deduction to 0 (no deduction)', () => {
    expect(SYSTEM_DEFAULTS.breakDeductionMinutes).toBe(0);
  });

  it('should default OT approval required to true', () => {
    expect(SYSTEM_DEFAULTS.approvalRequired).toBe(true);
  });

  it('should default autoMarkAbsentIfNoPunch to true', () => {
    expect(SYSTEM_DEFAULTS.autoMarkAbsentIfNoPunch).toBe(true);
  });

  it('should default ignoreLate flags to true for holiday, weekoff, leave', () => {
    expect(SYSTEM_DEFAULTS.ignoreLateOnLeaveDay).toBe(true);
    expect(SYSTEM_DEFAULTS.ignoreLateOnHoliday).toBe(true);
    expect(SYSTEM_DEFAULTS.ignoreLateOnWeekOff).toBe(true);
  });

  it('should default dayBoundaryTime to midnight', () => {
    expect(SYSTEM_DEFAULTS.dayBoundaryTime).toBe('00:00');
  });

  it('should not have compOffEnabled by default', () => {
    expect(SYSTEM_DEFAULTS.compOffEnabled).toBe(false);
  });

  it('should not enforce OT caps by default', () => {
    expect(SYSTEM_DEFAULTS.enforceCaps).toBe(false);
  });
});

// ─── getIndustryDefaults ─────────────────────────────────────────────────────

describe('getIndustryDefaults', () => {
  describe('exact match', () => {
    it('should return IT template for "IT"', () => {
      const d = getIndustryDefaults('IT');
      expect(d.attendanceRules.gracePeriodMinutes).toBe(30);
      expect(d.attendanceRules.gpsRequired).toBe(false);
      expect(d.attendanceRules.lateDeductionType).toBe('NONE');
      expect(d.attendanceRules.regularizationWindowDays).toBe(14);
      expect(d.controls.performanceEnabled).toBe(true);
      expect(d.controls.compOffEnabled).toBe(true);
      expect(d.essConfig.wfhRequest).toBe(true);
      expect(d.essConfig.performanceGoals).toBe(true);
    });

    it('should return MANUFACTURING template for "MANUFACTURING"', () => {
      const d = getIndustryDefaults('MANUFACTURING');
      expect(d.attendanceRules.gracePeriodMinutes).toBe(10);
      expect(d.attendanceRules.gpsRequired).toBe(true);
      expect(d.attendanceRules.lateDeductionType).toBe('HALF_DAY_AFTER_LIMIT');
      expect(d.settings.biometricIntegration).toBe(true);
      expect(d.controls.ncEditMode).toBe(true);
      expect(d.controls.loadUnload).toBe(true);
      expect(d.controls.cycleTime).toBe(true);
      expect(d.overtimeRules.enforceCaps).toBe(true);
      expect(d.overtimeRules.dailyCapHours).toBe(4);
      expect(d.overtimeRules.weeklyCapHours).toBe(20);
      expect(d.overtimeRules.monthlyCapHours).toBe(60);
      expect(d.overtimeRules.compOffEnabled).toBe(true);
      expect(d.overtimeRules.compOffExpiryDays).toBe(90);
    });

    it('should return RETAIL template for "RETAIL"', () => {
      const d = getIndustryDefaults('RETAIL');
      expect(d.attendanceRules.punchMode).toBe('SHIFT_BASED');
      expect(d.attendanceRules.selfieRequired).toBe(true);
      expect(d.attendanceRules.gpsRequired).toBe(true);
      expect(d.attendanceRules.gracePeriodMinutes).toBe(10);
      expect(d.overtimeRules.weekendMultiplier).toBe(1.5);
      expect(d.overtimeRules.holidayMultiplier).toBe(2.0);
      expect(d.overtimeRules.enforceCaps).toBe(true);
      expect(d.overtimeRules.dailyCapHours).toBe(3);
      expect(d.overtimeRules.monthlyCapHours).toBe(40);
      expect(d.essConfig.shiftSwapRequest).toBe(true);
      expect(d.essConfig.mobileOfflinePunch).toBe(true);
    });

    it('should return HEALTHCARE template for "HEALTHCARE"', () => {
      const d = getIndustryDefaults('HEALTHCARE');
      expect(d.attendanceRules.punchMode).toBe('SHIFT_BASED');
      expect(d.attendanceRules.selfieRequired).toBe(true);
      expect(d.attendanceRules.gpsRequired).toBe(true);
      expect(d.settings.biometricIntegration).toBe(true);
      expect(d.controls.mfaRequired).toBe(true);
      expect(d.controls.auditLogRetentionDays).toBe(730);
      expect(d.overtimeRules.holidayMultiplier).toBe(2.5);
      expect(d.overtimeRules.nightShiftMultiplier).toBe(2.0);
      expect(d.overtimeRules.weekendMultiplier).toBe(2.0);
      expect(d.overtimeRules.maxContinuousOtHours).toBe(6);
      expect(d.overtimeRules.monthlyCapHours).toBe(72);
    });
  });

  describe('case-insensitive matching', () => {
    it('should match "it" (lowercase) to IT template', () => {
      const d = getIndustryDefaults('it');
      expect(d.attendanceRules.gracePeriodMinutes).toBe(30);
    });

    it('should match "Manufacturing" (mixed case) to MANUFACTURING template', () => {
      const d = getIndustryDefaults('Manufacturing');
      expect(d.attendanceRules.lateDeductionType).toBe('HALF_DAY_AFTER_LIMIT');
    });

    it('should match "  RETAIL  " (with whitespace) to RETAIL template', () => {
      const d = getIndustryDefaults('  RETAIL  ');
      expect(d.attendanceRules.punchMode).toBe('SHIFT_BASED');
    });
  });

  describe('fuzzy matching', () => {
    it('should match "Software" keyword to IT template', () => {
      const d = getIndustryDefaults('Software');
      expect(d.attendanceRules.gracePeriodMinutes).toBe(30);
    });

    it('should match "Tech Services" keyword to IT template', () => {
      const d = getIndustryDefaults('Tech Services');
      expect(d.attendanceRules.lateDeductionType).toBe('NONE');
    });

    it('should match "Factory" keyword to MANUFACTURING template', () => {
      const d = getIndustryDefaults('Factory');
      expect(d.attendanceRules.gpsRequired).toBe(true);
    });

    it('should match "Production" keyword to MANUFACTURING template', () => {
      const d = getIndustryDefaults('Production');
      expect(d.attendanceRules.lateDeductionType).toBe('HALF_DAY_AFTER_LIMIT');
    });

    it('should match "Hospital" keyword to HEALTHCARE template', () => {
      const d = getIndustryDefaults('Hospital');
      expect(d.attendanceRules.punchMode).toBe('SHIFT_BASED');
    });

    it('should match "Pharma" keyword to HEALTHCARE template', () => {
      const d = getIndustryDefaults('Pharma');
      expect(d.controls.mfaRequired).toBe(true);
    });

    it('should match "Retail Store" keyword to RETAIL template', () => {
      const d = getIndustryDefaults('Retail Store');
      expect(d.essConfig.mobileOfflinePunch).toBe(true);
    });

    it('should match "Commerce" keyword to RETAIL template', () => {
      const d = getIndustryDefaults('Commerce');
      expect(d.attendanceRules.selfieRequired).toBe(true);
    });
  });

  describe('fallback to default template', () => {
    it('should return default template when industryType is undefined', () => {
      const d = getIndustryDefaults(undefined);
      // DEFAULT_TEMPLATE has gracePeriod=15, gpsRequired=false, FIRST_LAST punchMode
      expect(d.attendanceRules.gracePeriodMinutes).toBe(15);
      expect(d.attendanceRules.gpsRequired).toBe(false);
      expect(d.attendanceRules.punchMode).toBe('FIRST_LAST');
    });

    it('should return default template for an empty string', () => {
      // Empty string normalises to '' which matches nothing
      const d = getIndustryDefaults('');
      // '' is falsy? No — empty string is not undefined/null so it goes through normalise.
      // '' has no fuzzy matches, so falls through to DEFAULT_TEMPLATE.
      expect(d.settings.currency).toBe('INR');
    });

    it('should return default template for a completely unknown industry', () => {
      const d = getIndustryDefaults('Agriculture');
      expect(d.attendanceRules.gracePeriodMinutes).toBe(15);
      expect(d.controls.performanceEnabled).toBe(false);
    });

    it('should return default template for "UNKNOWN"', () => {
      const d = getIndustryDefaults('UNKNOWN');
      expect(d.settings.timezone).toBe('Asia/Kolkata');
    });
  });

  describe('default template field validation', () => {
    it('should have valid default currency', () => {
      const d = getIndustryDefaults(undefined);
      const validCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
      expect(validCurrencies).toContain(d.settings.currency);
    });

    it('should have valid default timeFormat', () => {
      const d = getIndustryDefaults(undefined);
      const validFormats = ['TWELVE_HOUR', 'TWENTY_FOUR_HOUR'];
      expect(validFormats).toContain(d.settings.timeFormat);
    });

    it('should have attendance, leave, and payroll enabled in the default template', () => {
      const d = getIndustryDefaults(undefined);
      expect(d.controls.attendanceEnabled).toBe(true);
      expect(d.controls.leaveEnabled).toBe(true);
      expect(d.controls.payrollEnabled).toBe(true);
    });
  });
});
