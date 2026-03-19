import { z } from 'zod';

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
  fromTime: z.string().min(1),
  toTime: z.string().min(1),
  noShuffle: z.boolean().optional(),
  downtimeSlots: z.array(z.object({
    type: z.string().min(1),
    duration: z.string().min(1),
  })).optional(),
});

export const updateShiftSchema = createShiftSchema.partial();

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

// ── Controls ────────────────────────────────────────────────────────

export const updateControlsSchema = z.object({
  ncEditMode: z.boolean().optional(),
  loadUnload: z.boolean().optional(),
  cycleTime: z.boolean().optional(),
  payrollLock: z.boolean().optional(),
  leaveCarryForward: z.boolean().optional(),
  overtimeApproval: z.boolean().optional(),
  mfa: z.boolean().optional(),
});

// ── Settings (preferences) ──────────────────────────────────────────

export const updateSettingsSchema = z.object({
  currency: z.string().optional(),
  language: z.string().optional(),
  dateFormat: z.string().optional(),
  numberFormat: z.string().optional(),
  timeFormat: z.string().optional(),
  indiaCompliance: z.boolean().optional(),
  multiCurrency: z.boolean().optional(),
  ess: z.boolean().optional(),
  mobileApp: z.boolean().optional(),
  webApp: z.boolean().optional(),
  systemApp: z.boolean().optional(),
  aiChatbot: z.boolean().optional(),
  eSign: z.boolean().optional(),
  biometric: z.boolean().optional(),
  bankIntegration: z.boolean().optional(),
  emailNotif: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
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
