import { z } from 'zod';
import { RESERVED_SLUGS } from '../../shared/constants/tenancy';

// ── Slug schema ──────────────────────────────────────────────────────

const slugSchema = z.string()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug must be at most 50 characters')
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase, alphanumeric with hyphens only, cannot start or end with hyphen')
  .refine((val) => !RESERVED_SLUGS.has(val), 'This slug is reserved and cannot be used');

// ── Sub-schemas ──────────────────────────────────────────────────────

const addressBlockSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  district: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  pin: z.string().min(1, 'PIN code is required').regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  country: z.string().min(1, 'Country is required'),
  stdCode: z.string().optional(),
});

const locationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  code: z.string().min(1, 'Location code is required'),
  facilityType: z.string().min(1, 'Facility type is required'),
  customFacilityType: z.string().optional(),
  status: z.string().default('Active'),
  isHQ: z.boolean().default(false),
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
  geoEnabled: z.boolean().default(false),
  geoLocationName: z.string().optional(),
  geoLat: z.string().optional(),
  geoLng: z.string().optional(),
  geoRadius: z.number().optional(),
  geoShape: z.string().optional(),
  moduleIds: z.array(z.string()).optional(),
  customModulePricing: z.record(z.string(), z.number()).optional(),
  userTier: z.string().optional(),
  customUserLimit: z.string().optional(),
  customTierPrice: z.string().optional(),
  billingType: z.string().optional(),
  trialDays: z.number().int().min(0).optional(),
});

const commercialSchema = z.object({
  selectedModuleIds: z.array(z.string()).optional(),
  customModulePricing: z.record(z.string(), z.number()).optional(),
  userTier: z.string().optional(),
  customUserLimit: z.string().optional(),
  customTierPrice: z.string().optional(),
  billingType: z.string().optional(),
  trialDays: z.number().int().min(0).optional(),
});

const contactSchema = z.object({
  name: z.string().min(1, 'Contact name is required'),
  designation: z.string().optional(),
  department: z.string().optional(),
  type: z.string().min(1, 'Contact type is required'),
  email: z.string().email('Invalid email address'),
  countryCode: z.string().optional(),
  mobile: z.string().min(1, 'Mobile number is required').regex(/^\d{10,15}$/, 'Invalid mobile number'),
  linkedin: z.string().optional(),
});

const shiftItemSchema = z.object({
  name: z.string().min(1),
  fromTime: z.string().min(1),
  toTime: z.string().min(1),
  noShuffle: z.boolean().optional(),
  downtimeSlots: z.array(z.object({
    type: z.string().min(1),
    duration: z.string().min(1),
  })).optional(),
});

const noSeriesSchema = z.object({
  code: z.string().min(1, 'Series code is required'),
  linkedScreen: z.string().min(1, 'Linked screen is required'),
  description: z.string().optional(),
  prefix: z.string().min(1, 'Prefix is required'),
  suffix: z.string().optional(),
  numberCount: z.number().int().min(1).optional(),
  startNumber: z.number().int().min(0).optional(),
});

const iotReasonSchema = z.object({
  reasonType: z.string().min(1),
  reason: z.string().min(1),
  description: z.string().optional(),
  department: z.string().optional(),
  planned: z.boolean().optional(),
  duration: z.string().optional(),
});

const userSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  username: z.string().min(2, 'Username is required').regex(/^[a-zA-Z0-9._-]+$/, 'Username must contain only letters, numbers, dots, hyphens, and underscores'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Role is required'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().optional(),
  department: z.string().optional(),
});

// ── Full onboarding schema ───────────────────────────────────────────

export const onboardTenantSchema = z.object({
  identity: z.object({
    displayName: z.string().min(2, 'Company display name is required'),
    legalName: z.string().min(2, 'Legal name is required'),
    businessType: z.string().min(1, 'Business type is required'),
    industry: z.string().min(1, 'Industry is required'),
    companyCode: z.string().min(2, 'Company code is required').regex(/^[A-Z0-9_-]+$/i, 'Company code must contain only letters, numbers, hyphens, and underscores'),
    slug: slugSchema,
    shortName: z.string().optional(),
    incorporationDate: z.string().optional(),
    employeeCount: z.string().optional(),
    cin: z.string().optional(),
    website: z.string().optional(),
    emailDomain: z.string().min(1, 'Email domain is required').regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/, 'Invalid email domain format'),
    logoUrl: z.string().optional(),
    wizardStatus: z.string().optional(),
  }),

  statutory: z.object({
    pan: z.string().min(1, 'PAN is required').regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format (expected: AAAAA9999A)'),
    tan: z.string().optional(),
    gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format').optional(),
    pfRegNo: z.string().optional(),
    esiCode: z.string().optional(),
    ptReg: z.string().optional(),
    lwfrNo: z.string().optional(),
    rocState: z.string().optional(),
  }),

  address: z.object({
    registered: addressBlockSchema,
    sameAsRegistered: z.boolean(),
    corporate: addressBlockSchema.optional(),
  }),

  fiscal: z.object({
    fyType: z.string().min(1, 'Financial year type is required'),
    fyCustomStartMonth: z.string().optional(),
    fyCustomEndMonth: z.string().optional(),
    payrollFreq: z.string().min(1, 'Payroll frequency is required'),
    cutoffDay: z.string().min(1, 'Cutoff day is required'),
    disbursementDay: z.string().min(1, 'Disbursement day is required'),
    weekStart: z.string().min(1, 'Week start day is required'),
    timezone: z.string().min(1, 'Timezone is required'),
    workingDays: z.array(z.string()).min(1, 'At least one working day is required'),
  }),

  preferences: z.object({
    currency: z.string().min(1, 'Currency is required'),
    language: z.string().min(1, 'Language is required'),
    dateFormat: z.string().min(1, 'Date format is required'),
    numberFormat: z.string().optional(),
    timeFormat: z.string().optional(),
    indiaCompliance: z.boolean(),
    multiCurrency: z.boolean().optional(),
    ess: z.boolean().optional(),
    mobileApp: z.boolean(),
    webApp: z.boolean(),
    systemApp: z.boolean().optional(),
    aiChatbot: z.boolean().optional(),
    eSign: z.boolean().optional(),
    biometric: z.boolean(),
    bankIntegration: z.boolean(),
    emailNotif: z.boolean(),
    whatsapp: z.boolean().optional(),
    razorpayEnabled: z.boolean().optional(),
    razorpayKeyId: z.string().optional(),
    razorpayKeySecret: z.string().optional(),
    razorpayWebhookSecret: z.string().optional(),
    razorpayAccountNumber: z.string().optional(),
    razorpayAutoDisbursement: z.boolean().optional(),
    razorpayTestMode: z.boolean().optional(),
  }),

  endpoint: z.object({
    endpointType: z.enum(['default', 'custom']),
    customBaseUrl: z.string().optional(),
  }),

  strategy: z.object({
    multiLocationMode: z.boolean(),
    locationConfig: z.enum(['common', 'per-location']),
  }),

  locations: z.array(locationSchema).min(1),

  commercial: commercialSchema.optional(),

  contacts: z.array(contactSchema).default([]),

  shifts: z.object({
    dayStartTime: z.string().optional(),
    dayEndTime: z.string().optional(),
    weeklyOffs: z.array(z.string()).optional(),
    items: z.array(shiftItemSchema).default([]),
  }),

  noSeries: z.array(noSeriesSchema).default([]),

  iotReasons: z.array(iotReasonSchema).default([]),

  controls: z.object({
    ncEditMode: z.boolean().optional(),
    loadUnload: z.boolean().optional(),
    cycleTime: z.boolean().optional(),
    payrollLock: z.boolean().optional(),
    leaveCarryForward: z.boolean().optional(),
    overtimeApproval: z.boolean().optional(),
    mfa: z.boolean().optional(),
  }).default({}),

  users: z.array(userSchema).default([]),
});

// ── Section-update schemas ───────────────────────────────────────────

export const updateSectionSchemas: Record<string, z.ZodType<any>> = {
  identity: onboardTenantSchema.shape.identity,
  statutory: onboardTenantSchema.shape.statutory,
  address: onboardTenantSchema.shape.address,
  fiscal: onboardTenantSchema.shape.fiscal,
  preferences: onboardTenantSchema.shape.preferences,
  endpoint: onboardTenantSchema.shape.endpoint,
  strategy: onboardTenantSchema.shape.strategy,
  controls: onboardTenantSchema.shape.controls,
  locations: z.array(locationSchema).min(1),
  contacts: z.array(contactSchema),
  shifts: onboardTenantSchema.shape.shifts,
  noSeries: z.array(noSeriesSchema),
  iotReasons: z.array(iotReasonSchema),
  users: z.array(userSchema),
  commercial: commercialSchema,
};

// Status update
export const updateCompanyStatusSchema = z.object({
  status: z.enum(['Draft', 'Pilot', 'Active', 'Inactive']),
});
