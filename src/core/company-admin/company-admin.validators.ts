import { z } from 'zod';
import {
  CurrencyCode,
  LanguageCode,
  TimeFormat,
  ShiftType,
  BreakType,
  DeviceType,
} from '@prisma/client';

// ── Location ────────────────────────────────────────────────────────

export const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  facilityType: z.string().min(1).optional(),
  customFacilityType: z.string().optional(),
  status: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  pin: z.string().optional(),
  country: z.string().optional(),
  stdCode: z.string().optional(),
  gstin: z.string().optional(),
  stateGST: z.string().optional(),
  contactName: z.string().optional(),
  contactDesignation: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactCountryCode: z.string().optional(),
  contactPhone: z.string().optional(),
  geoEnabled: z.boolean().optional(),
  geoLocationName: z.string().optional(),
  geoLat: z.string().optional(),
  geoLng: z.string().optional(),
  geoRadius: z.number().optional(),
  geoShape: z.string().optional(),
});

// ── Shift ───────────────────────────────────────────────────────────

export const createShiftSchema = z.object({
  name: z.string().min(1),
  shiftType: z.nativeEnum(ShiftType).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  isCrossDay: z.boolean().optional(),

  // Policy overrides (null = inherit from Attendance Rules)
  gracePeriodMinutes: z.number().int().min(0).nullable().optional(),
  earlyExitToleranceMinutes: z.number().int().min(0).nullable().optional(),
  halfDayThresholdHours: z.number().min(0).max(24).nullable().optional(),
  fullDayThresholdHours: z.number().min(0).max(24).nullable().optional(),
  maxLateCheckInMinutes: z.number().int().min(0).nullable().optional(),
  minWorkingHoursForOT: z.number().min(0).max(24).nullable().optional(),

  // Capture overrides (null = inherit)
  requireSelfie: z.boolean().nullable().optional(),
  requireGPS: z.boolean().nullable().optional(),
  allowedSources: z.array(z.nativeEnum(DeviceType)).optional(),

  // Behavior
  noShuffle: z.boolean().optional(),
  autoClockOutMinutes: z.number().int().min(1).nullable().optional(),
});

export const updateShiftSchema = createShiftSchema.partial();

// ── Shift Break ─────────────────────────────────────────────────────

export const createShiftBreakSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(BreakType),
  startTime: z.string().nullable().optional(), // null for flexible breaks
  duration: z.number().int().min(1),
  isPaid: z.boolean().optional(),
});

export const updateShiftBreakSchema = createShiftBreakSchema.partial();

// ── Contact ─────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  name: z.string().min(1),
  designation: z.string().optional(),
  department: z.string().optional(),
  type: z.string().min(1),
  email: z.string().email(),
  countryCode: z.string().optional(),
  mobile: z.string().min(1),
  linkedin: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

// ── No. Series ──────────────────────────────────────────────────────

export const createNoSeriesSchema = z.object({
  code: z.string().min(1),
  linkedScreen: z.string().min(1),
  description: z.string().optional(),
  prefix: z.string().min(1),
  suffix: z.string().optional(),
  numberCount: z.number().int().min(1).optional(),
  startNumber: z.number().int().min(0).optional(),
});

export const updateNoSeriesSchema = createNoSeriesSchema.partial();

// ── IoT Reasons ─────────────────────────────────────────────────────

export const createIotReasonSchema = z.object({
  reasonType: z.string().min(1),
  reason: z.string().min(1),
  description: z.string().optional(),
  department: z.string().optional(),
  planned: z.boolean().optional(),
  duration: z.string().optional(),
});

export const updateIotReasonSchema = createIotReasonSchema.partial();

// ── System Controls (typed model — replaces JSON blob) ──────────────

export const updateSystemControlsSchema = z.object({
  // Module Enablement
  attendanceEnabled: z.boolean().optional(),
  leaveEnabled: z.boolean().optional(),
  payrollEnabled: z.boolean().optional(),
  essEnabled: z.boolean().optional(),
  performanceEnabled: z.boolean().optional(),
  recruitmentEnabled: z.boolean().optional(),
  trainingEnabled: z.boolean().optional(),
  mobileAppEnabled: z.boolean().optional(),
  aiChatbotEnabled: z.boolean().optional(),

  // Production Controls
  ncEditMode: z.boolean().optional(),
  loadUnload: z.boolean().optional(),
  cycleTime: z.boolean().optional(),

  // Payroll Controls
  payrollLock: z.boolean().optional(),
  backdatedEntryControl: z.boolean().optional(),

  // Leave Controls
  leaveCarryForward: z.boolean().optional(),
  compOffEnabled: z.boolean().optional(),
  halfDayLeaveEnabled: z.boolean().optional(),

  // Security & Access
  mfaRequired: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  maxConcurrentSessions: z.number().int().min(1).max(10).optional(),
  passwordMinLength: z.number().int().min(6).max(32).optional(),
  passwordComplexity: z.boolean().optional(),
  accountLockThreshold: z.number().int().min(1).max(20).optional(),
  accountLockDurationMinutes: z.number().int().min(1).max(1440).optional(),

  // Audit
  auditLogRetentionDays: z.number().int().min(30).max(730).optional(),
});

// ── Company Settings (typed model — replaces preferences JSON) ──────

export const updateCompanySettingsSchema = z.object({
  // Locale
  currency: z.nativeEnum(CurrencyCode).optional(),
  language: z.nativeEnum(LanguageCode).optional(),
  timezone: z.string().min(1).optional(),
  dateFormat: z.string().min(1).optional(),
  timeFormat: z.nativeEnum(TimeFormat).optional(),
  numberFormat: z.string().min(1).optional(),

  // Compliance
  indiaCompliance: z.boolean().optional(),
  gdprMode: z.boolean().optional(),
  auditTrail: z.boolean().optional(),

  // Integrations
  bankIntegration: z.boolean().optional(),
  razorpayEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  whatsappNotifications: z.boolean().optional(),
  biometricIntegration: z.boolean().optional(),
  eSignIntegration: z.boolean().optional(),
});

// ── Users ───────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.string().min(1).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// ── Module CRUD ────────────────────────────────────────────────────

export const addModulesSchema = z.object({
  moduleIds: z.array(z.string().min(1)).min(1).max(10),
});

// ── Profile Section (company-admin limited) ─────────────────────────

export const profileSectionSchemas: Record<string, z.ZodType<any>> = {
  identity: z.object({
    displayName: z.string().min(2).optional(),
    legalName: z.string().min(2).optional(),
    shortName: z.string().optional(),
    logoUrl: z.string().optional(),
    website: z.string().optional(),
    emailDomain: z.string().optional(),
  }),
  address: z.object({
    registered: z.object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      district: z.string().optional(),
      state: z.string().min(1),
      pin: z.string().min(1),
      country: z.string().min(1),
      stdCode: z.string().optional(),
    }),
    sameAsRegistered: z.boolean(),
    corporate: z.object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      district: z.string().optional(),
      state: z.string().min(1),
      pin: z.string().min(1),
      country: z.string().min(1),
      stdCode: z.string().optional(),
    }).optional(),
  }),
  contacts: z.array(z.object({
    name: z.string().min(1),
    designation: z.string().optional(),
    department: z.string().optional(),
    type: z.string().min(1),
    email: z.string().email(),
    countryCode: z.string().optional(),
    mobile: z.string().min(1),
    linkedin: z.string().optional(),
  })),
};
