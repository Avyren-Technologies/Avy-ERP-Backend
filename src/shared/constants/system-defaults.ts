/**
 * SYSTEM_DEFAULTS — Hardcoded fallback values for the HRMS configuration resolution chain.
 *
 * These are the absolute last resort. Every resolution chain terminates here when
 * all higher layers (shift, attendance rules, etc.) return null.
 *
 * In normal operation these should rarely be reached, since AttendanceRule always
 * has Prisma-level defaults. They exist as a safety net.
 */
export const SYSTEM_DEFAULTS = {
  // ── Policy Fields (grace, thresholds, deductions) ──
  gracePeriodMinutes: 15,
  earlyExitToleranceMinutes: 15,
  maxLateCheckInMinutes: 240,
  halfDayThresholdHours: 4,
  fullDayThresholdHours: 8,

  // ── Capture Requirements ──
  selfieRequired: false,
  gpsRequired: false,

  // ── Punch Interpretation ──
  punchMode: 'FIRST_LAST' as const,

  // ── Rounding ──
  workingHoursRounding: 'NONE' as const,
  punchTimeRounding: 'NONE' as const,
  punchTimeRoundingDirection: 'NEAREST' as const,

  // ── Break Deduction ──
  breakDeductionMinutes: 0,

  // ── Auto-Processing ──
  autoMarkAbsentIfNoPunch: true,
  autoHalfDayEnabled: true,
  autoAbsentAfterDays: 0,
  regularizationWindowDays: 7,

  // ── Late/Early Tracking ──
  lateArrivalsAllowedPerMonth: 3,
  lopAutoDeduct: true,
  lateDeductionType: 'NONE' as const,
  earlyExitDeductionType: 'NONE' as const,

  // ── Exception Handling ──
  ignoreLateOnLeaveDay: true,
  ignoreLateOnHoliday: true,
  ignoreLateOnWeekOff: true,

  // ── Missing Punch ──
  missingPunchAlert: true,

  // ── OT ──
  minimumOtMinutes: 30,
  thresholdMinutes: 30,
  weekdayMultiplier: 1.5,
  approvalRequired: true,
  autoIncludePayroll: false,
  compOffEnabled: false,
  enforceCaps: false,
  includeBreaksInOT: false,
  calculationBasis: 'AFTER_SHIFT' as const,
  roundingStrategy: 'NONE' as const,

  // ── Day Boundary ──
  dayBoundaryTime: '00:00',
} as const;

// ─── Industry Template Types ─────────────────────────────────────────────────

export type IndustryType = 'MANUFACTURING' | 'IT' | 'RETAIL' | 'HEALTHCARE';

export interface IndustryDefaults {
  settings: CompanySettingsDefaults;
  controls: SystemControlsDefaults;
  attendanceRules: AttendanceRuleDefaults;
  overtimeRules: OvertimeRuleDefaults;
  essConfig: ESSConfigDefaults;
}

interface CompanySettingsDefaults {
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';
  language?: 'en' | 'hi' | 'ta' | 'te' | 'mr' | 'kn';
  timezone?: string;
  dateFormat?: string;
  timeFormat?: 'TWELVE_HOUR' | 'TWENTY_FOUR_HOUR';
  numberFormat?: string;
  indiaCompliance?: boolean;
  gdprMode?: boolean;
  auditTrail?: boolean;
  bankIntegration?: boolean;
  razorpayEnabled?: boolean;
  emailNotifications?: boolean;
  whatsappNotifications?: boolean;
  biometricIntegration?: boolean;
  eSignIntegration?: boolean;
}

interface SystemControlsDefaults {
  attendanceEnabled?: boolean;
  leaveEnabled?: boolean;
  payrollEnabled?: boolean;
  essEnabled?: boolean;
  performanceEnabled?: boolean;
  recruitmentEnabled?: boolean;
  trainingEnabled?: boolean;
  mobileAppEnabled?: boolean;
  aiChatbotEnabled?: boolean;
  ncEditMode?: boolean;
  loadUnload?: boolean;
  cycleTime?: boolean;
  payrollLock?: boolean;
  backdatedEntryControl?: boolean;
  leaveCarryForward?: boolean;
  compOffEnabled?: boolean;
  halfDayLeaveEnabled?: boolean;
  mfaRequired?: boolean;
  sessionTimeoutMinutes?: number;
  maxConcurrentSessions?: number;
  passwordMinLength?: number;
  passwordComplexity?: boolean;
  accountLockThreshold?: number;
  accountLockDurationMinutes?: number;
  auditLogRetentionDays?: number;
}

interface AttendanceRuleDefaults {
  dayBoundaryTime?: string;
  gracePeriodMinutes?: number;
  earlyExitToleranceMinutes?: number;
  maxLateCheckInMinutes?: number;
  halfDayThresholdHours?: number;
  fullDayThresholdHours?: number;
  lateArrivalsAllowedPerMonth?: number;
  lopAutoDeduct?: boolean;
  lateDeductionType?: 'NONE' | 'HALF_DAY_AFTER_LIMIT' | 'PERCENTAGE';
  earlyExitDeductionType?: 'NONE' | 'HALF_DAY_AFTER_LIMIT' | 'PERCENTAGE';
  punchMode?: 'FIRST_LAST' | 'EVERY_PAIR' | 'SHIFT_BASED';
  autoMarkAbsentIfNoPunch?: boolean;
  autoHalfDayEnabled?: boolean;
  autoAbsentAfterDays?: number;
  regularizationWindowDays?: number;
  workingHoursRounding?: 'NONE' | 'NEAREST_15' | 'NEAREST_30' | 'FLOOR_15' | 'CEIL_15';
  punchTimeRounding?: 'NONE' | 'NEAREST_5' | 'NEAREST_15';
  punchTimeRoundingDirection?: 'NEAREST' | 'UP' | 'DOWN';
  ignoreLateOnLeaveDay?: boolean;
  ignoreLateOnHoliday?: boolean;
  ignoreLateOnWeekOff?: boolean;
  selfieRequired?: boolean;
  gpsRequired?: boolean;
  missingPunchAlert?: boolean;
}

interface OvertimeRuleDefaults {
  calculationBasis?: 'AFTER_SHIFT' | 'TOTAL_HOURS';
  thresholdMinutes?: number;
  minimumOtMinutes?: number;
  includeBreaksInOT?: boolean;
  weekdayMultiplier?: number;
  weekendMultiplier?: number;
  holidayMultiplier?: number;
  nightShiftMultiplier?: number;
  dailyCapHours?: number;
  weeklyCapHours?: number;
  monthlyCapHours?: number;
  enforceCaps?: boolean;
  maxContinuousOtHours?: number;
  approvalRequired?: boolean;
  autoIncludePayroll?: boolean;
  compOffEnabled?: boolean;
  compOffExpiryDays?: number;
  roundingStrategy?: 'NONE' | 'NEAREST_15' | 'NEAREST_30' | 'FLOOR_15' | 'CEIL_15';
}

interface ESSConfigDefaults {
  viewPayslips?: boolean;
  downloadPayslips?: boolean;
  downloadForm16?: boolean;
  viewSalaryStructure?: boolean;
  itDeclaration?: boolean;
  leaveApplication?: boolean;
  leaveBalanceView?: boolean;
  leaveCancellation?: boolean;
  attendanceView?: boolean;
  attendanceRegularization?: boolean;
  viewShiftSchedule?: boolean;
  shiftSwapRequest?: boolean;
  wfhRequest?: boolean;
  profileUpdate?: boolean;
  documentUpload?: boolean;
  employeeDirectory?: boolean;
  viewOrgChart?: boolean;
  reimbursementClaims?: boolean;
  loanApplication?: boolean;
  assetView?: boolean;
  performanceGoals?: boolean;
  appraisalAccess?: boolean;
  feedback360?: boolean;
  trainingEnrollment?: boolean;
  helpDesk?: boolean;
  grievanceSubmission?: boolean;
  holidayCalendar?: boolean;
  policyDocuments?: boolean;
  announcementBoard?: boolean;
  mssViewTeam?: boolean;
  mssApproveLeave?: boolean;
  mssApproveAttendance?: boolean;
  mssViewTeamAttendance?: boolean;
  mobileOfflinePunch?: boolean;
  mobileSyncRetryMinutes?: number;
  mobileLocationAccuracy?: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ─── Default Template (used when no industry type matches) ───────────────────

const DEFAULT_TEMPLATE: IndustryDefaults = {
  settings: {
    currency: 'INR',
    language: 'en',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'TWELVE_HOUR',
    numberFormat: 'en-IN',
    indiaCompliance: true,
    gdprMode: false,
    auditTrail: true,
    bankIntegration: false,
    razorpayEnabled: false,
    emailNotifications: true,
    whatsappNotifications: false,
    biometricIntegration: false,
    eSignIntegration: false,
  },
  controls: {
    attendanceEnabled: true,
    leaveEnabled: true,
    payrollEnabled: true,
    essEnabled: true,
    performanceEnabled: false,
    recruitmentEnabled: true,
    trainingEnabled: true,
    mobileAppEnabled: true,
    aiChatbotEnabled: false,
    ncEditMode: false,
    loadUnload: false,
    cycleTime: false,
    payrollLock: true,
    backdatedEntryControl: false,
    leaveCarryForward: true,
    compOffEnabled: false,
    halfDayLeaveEnabled: true,
    mfaRequired: false,
    sessionTimeoutMinutes: 30,
    maxConcurrentSessions: 3,
    passwordMinLength: 8,
    passwordComplexity: true,
    accountLockThreshold: 5,
    accountLockDurationMinutes: 30,
    auditLogRetentionDays: 365,
  },
  attendanceRules: {
    dayBoundaryTime: '00:00',
    gracePeriodMinutes: 15,
    earlyExitToleranceMinutes: 15,
    maxLateCheckInMinutes: 240,
    halfDayThresholdHours: 4,
    fullDayThresholdHours: 8,
    lateArrivalsAllowedPerMonth: 3,
    lopAutoDeduct: true,
    lateDeductionType: 'NONE',
    earlyExitDeductionType: 'NONE',
    punchMode: 'FIRST_LAST',
    autoMarkAbsentIfNoPunch: true,
    autoHalfDayEnabled: true,
    autoAbsentAfterDays: 0,
    regularizationWindowDays: 7,
    workingHoursRounding: 'NONE',
    punchTimeRounding: 'NONE',
    punchTimeRoundingDirection: 'NEAREST',
    ignoreLateOnLeaveDay: true,
    ignoreLateOnHoliday: true,
    ignoreLateOnWeekOff: true,
    selfieRequired: false,
    gpsRequired: false,
    missingPunchAlert: true,
  },
  overtimeRules: {
    calculationBasis: 'AFTER_SHIFT',
    thresholdMinutes: 30,
    minimumOtMinutes: 30,
    includeBreaksInOT: false,
    weekdayMultiplier: 1.5,
    enforceCaps: false,
    approvalRequired: true,
    autoIncludePayroll: false,
    compOffEnabled: false,
    roundingStrategy: 'NONE',
  },
  essConfig: {
    viewPayslips: true,
    downloadPayslips: true,
    downloadForm16: true,
    viewSalaryStructure: false,
    itDeclaration: true,
    leaveApplication: true,
    leaveBalanceView: true,
    leaveCancellation: false,
    attendanceView: true,
    attendanceRegularization: false,
    viewShiftSchedule: false,
    shiftSwapRequest: false,
    wfhRequest: false,
    profileUpdate: false,
    documentUpload: false,
    employeeDirectory: false,
    viewOrgChart: false,
    reimbursementClaims: false,
    loanApplication: false,
    assetView: false,
    performanceGoals: false,
    appraisalAccess: false,
    feedback360: false,
    trainingEnrollment: false,
    helpDesk: false,
    grievanceSubmission: false,
    holidayCalendar: true,
    policyDocuments: false,
    announcementBoard: false,
    mssViewTeam: false,
    mssApproveLeave: false,
    mssApproveAttendance: false,
    mssViewTeamAttendance: false,
    mobileOfflinePunch: false,
    mobileSyncRetryMinutes: 5,
    mobileLocationAccuracy: 'HIGH',
  },
};

// ─── Industry Templates ──────────────────────────────────────────────────────

/**
 * MANUFACTURING: Strict attendance, biometric required, multi-shift support,
 * enforced OT caps, comp-off enabled, production controls enabled.
 */
const MANUFACTURING_TEMPLATE: IndustryDefaults = {
  settings: {
    ...DEFAULT_TEMPLATE.settings,
    biometricIntegration: true,
  },
  controls: {
    ...DEFAULT_TEMPLATE.controls,
    ncEditMode: true,
    loadUnload: true,
    cycleTime: true,
    compOffEnabled: true,
  },
  attendanceRules: {
    ...DEFAULT_TEMPLATE.attendanceRules,
    gracePeriodMinutes: 10,
    punchMode: 'FIRST_LAST',
    selfieRequired: false,
    gpsRequired: true,
    lateDeductionType: 'HALF_DAY_AFTER_LIMIT',
  },
  overtimeRules: {
    ...DEFAULT_TEMPLATE.overtimeRules,
    weekdayMultiplier: 1.5,
    holidayMultiplier: 2.0,
    weekendMultiplier: 1.5,
    nightShiftMultiplier: 2.0,
    enforceCaps: true,
    dailyCapHours: 4,
    weeklyCapHours: 20,
    monthlyCapHours: 60,
    compOffEnabled: true,
    compOffExpiryDays: 90,
  },
  essConfig: {
    ...DEFAULT_TEMPLATE.essConfig,
    attendanceRegularization: true,
    viewShiftSchedule: true,
    profileUpdate: true,
    documentUpload: true,
    employeeDirectory: true,
    helpDesk: true,
    grievanceSubmission: true,
    policyDocuments: true,
    mssViewTeam: true,
    mssApproveLeave: true,
    mssApproveAttendance: true,
    mssViewTeamAttendance: true,
  },
};

/**
 * IT/Services: Flexible attendance, GPS optional, standard OT rates,
 * no caps, performance module enabled, WFH support.
 */
const IT_TEMPLATE: IndustryDefaults = {
  settings: {
    ...DEFAULT_TEMPLATE.settings,
    biometricIntegration: false,
  },
  controls: {
    ...DEFAULT_TEMPLATE.controls,
    performanceEnabled: true,
    compOffEnabled: true,
  },
  attendanceRules: {
    ...DEFAULT_TEMPLATE.attendanceRules,
    gracePeriodMinutes: 30,
    earlyExitToleranceMinutes: 30,
    maxLateCheckInMinutes: 360,
    punchMode: 'FIRST_LAST',
    selfieRequired: false,
    gpsRequired: false,
    lateDeductionType: 'NONE',
    regularizationWindowDays: 14,
  },
  overtimeRules: {
    ...DEFAULT_TEMPLATE.overtimeRules,
    weekdayMultiplier: 1.5,
    enforceCaps: false,
    compOffEnabled: true,
    compOffExpiryDays: 60,
  },
  essConfig: {
    ...DEFAULT_TEMPLATE.essConfig,
    attendanceRegularization: true,
    wfhRequest: true,
    viewShiftSchedule: true,
    profileUpdate: true,
    documentUpload: true,
    employeeDirectory: true,
    viewOrgChart: true,
    performanceGoals: true,
    appraisalAccess: true,
    feedback360: true,
    helpDesk: true,
    policyDocuments: true,
    announcementBoard: true,
    mssViewTeam: true,
    mssApproveLeave: true,
    mssApproveAttendance: true,
    mssViewTeamAttendance: true,
    mobileOfflinePunch: false,
  },
};

/**
 * RETAIL: Geo-fenced attendance, mobile GPS, rotating shifts,
 * weekend OT multiplier, shift-based punch mode.
 */
const RETAIL_TEMPLATE: IndustryDefaults = {
  settings: {
    ...DEFAULT_TEMPLATE.settings,
    biometricIntegration: false,
  },
  controls: {
    ...DEFAULT_TEMPLATE.controls,
    mobileAppEnabled: true,
  },
  attendanceRules: {
    ...DEFAULT_TEMPLATE.attendanceRules,
    gracePeriodMinutes: 10,
    punchMode: 'SHIFT_BASED',
    selfieRequired: true,
    gpsRequired: true,
    lateDeductionType: 'HALF_DAY_AFTER_LIMIT',
  },
  overtimeRules: {
    ...DEFAULT_TEMPLATE.overtimeRules,
    weekdayMultiplier: 1.5,
    weekendMultiplier: 1.5,
    holidayMultiplier: 2.0,
    enforceCaps: true,
    dailyCapHours: 3,
    monthlyCapHours: 40,
  },
  essConfig: {
    ...DEFAULT_TEMPLATE.essConfig,
    attendanceRegularization: true,
    viewShiftSchedule: true,
    shiftSwapRequest: true,
    profileUpdate: true,
    helpDesk: true,
    mssViewTeam: true,
    mssApproveLeave: true,
    mssApproveAttendance: true,
    mssViewTeamAttendance: true,
    mobileOfflinePunch: true,
    mobileLocationAccuracy: 'HIGH',
  },
};

/**
 * HEALTHCARE: Strict attendance, biometric+GPS, cross-day shifts,
 * night shift premium, MFA required, high OT multipliers.
 */
const HEALTHCARE_TEMPLATE: IndustryDefaults = {
  settings: {
    ...DEFAULT_TEMPLATE.settings,
    biometricIntegration: true,
    auditTrail: true,
  },
  controls: {
    ...DEFAULT_TEMPLATE.controls,
    mfaRequired: true,
    compOffEnabled: true,
    auditLogRetentionDays: 730,
  },
  attendanceRules: {
    ...DEFAULT_TEMPLATE.attendanceRules,
    gracePeriodMinutes: 10,
    punchMode: 'SHIFT_BASED',
    selfieRequired: true,
    gpsRequired: true,
    lateDeductionType: 'HALF_DAY_AFTER_LIMIT',
    missingPunchAlert: true,
  },
  overtimeRules: {
    ...DEFAULT_TEMPLATE.overtimeRules,
    weekdayMultiplier: 1.5,
    weekendMultiplier: 2.0,
    holidayMultiplier: 2.5,
    nightShiftMultiplier: 2.0,
    enforceCaps: true,
    dailyCapHours: 4,
    weeklyCapHours: 24,
    monthlyCapHours: 72,
    maxContinuousOtHours: 6,
    compOffEnabled: true,
    compOffExpiryDays: 60,
  },
  essConfig: {
    ...DEFAULT_TEMPLATE.essConfig,
    attendanceRegularization: true,
    viewShiftSchedule: true,
    shiftSwapRequest: true,
    profileUpdate: true,
    documentUpload: true,
    employeeDirectory: true,
    viewOrgChart: true,
    helpDesk: true,
    grievanceSubmission: true,
    policyDocuments: true,
    mssViewTeam: true,
    mssApproveLeave: true,
    mssApproveAttendance: true,
    mssViewTeamAttendance: true,
    mobileOfflinePunch: true,
    mobileLocationAccuracy: 'HIGH',
  },
};

// ─── Industry Template Map ───────────────────────────────────────────────────

const INDUSTRY_TEMPLATES: Record<IndustryType, IndustryDefaults> = {
  MANUFACTURING: MANUFACTURING_TEMPLATE,
  IT: IT_TEMPLATE,
  RETAIL: RETAIL_TEMPLATE,
  HEALTHCARE: HEALTHCARE_TEMPLATE,
};

/**
 * Returns industry-specific defaults for company config seeding.
 * Falls back to the DEFAULT_TEMPLATE when no matching industry type is found.
 *
 * @param industryType - Optional industry type string (case-insensitive)
 * @returns IndustryDefaults with settings, controls, attendance rules, OT rules, and ESS config
 */
export function getIndustryDefaults(industryType?: string): IndustryDefaults {
  if (!industryType) {
    return DEFAULT_TEMPLATE;
  }

  const normalised = industryType.toUpperCase().trim();

  // Try exact match first
  if (normalised in INDUSTRY_TEMPLATES) {
    return INDUSTRY_TEMPLATES[normalised as IndustryType];
  }

  // Fuzzy match: check if the industry string contains a known keyword
  if (normalised.includes('MANUFACTUR') || normalised.includes('FACTORY') || normalised.includes('PRODUCTION')) {
    return INDUSTRY_TEMPLATES.MANUFACTURING;
  }
  if (normalised.includes('IT') || normalised.includes('SOFTWARE') || normalised.includes('TECH') || normalised.includes('SERVICE')) {
    return INDUSTRY_TEMPLATES.IT;
  }
  if (normalised.includes('RETAIL') || normalised.includes('STORE') || normalised.includes('COMMERCE')) {
    return INDUSTRY_TEMPLATES.RETAIL;
  }
  if (normalised.includes('HEALTH') || normalised.includes('HOSPITAL') || normalised.includes('PHARMA') || normalised.includes('MEDICAL')) {
    return INDUSTRY_TEMPLATES.HEALTHCARE;
  }

  return DEFAULT_TEMPLATE;
}
