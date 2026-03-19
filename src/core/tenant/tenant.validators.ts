import { z } from 'zod';

// ── Sub-schemas ──────────────────────────────────────────────────────

const addressBlockSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  district: z.string().optional(),
  state: z.string().min(1),
  pin: z.string().min(1),
  country: z.string().min(1),
  stdCode: z.string().optional(),
});

const locationSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  facilityType: z.string().min(1),
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
  name: z.string().min(1),
  designation: z.string().optional(),
  department: z.string().optional(),
  type: z.string().min(1),
  email: z.string().email(),
  countryCode: z.string().optional(),
  mobile: z.string().min(1),
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
  code: z.string().min(1),
  linkedScreen: z.string().min(1),
  description: z.string().optional(),
  prefix: z.string().min(1),
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
  fullName: z.string().min(2),
  username: z.string().min(2),
  password: z.string().min(6),
  role: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().optional(),
  department: z.string().optional(),
});

// ── Full onboarding schema ───────────────────────────────────────────

export const onboardTenantSchema = z.object({
  identity: z.object({
    displayName: z.string().min(2),
    legalName: z.string().min(2),
    businessType: z.string().min(1),
    industry: z.string().min(1),
    companyCode: z.string().min(2),
    shortName: z.string().optional(),
    incorporationDate: z.string().optional(),
    employeeCount: z.string().optional(),
    cin: z.string().optional(),
    website: z.string().optional(),
    emailDomain: z.string().min(1),
    logoUrl: z.string().optional(),
    wizardStatus: z.string().optional(),
  }),

  statutory: z.object({
    pan: z.string().min(1),
    tan: z.string().optional(),
    gstin: z.string().optional(),
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
    fyType: z.string().min(1),
    fyCustomStartMonth: z.string().optional(),
    fyCustomEndMonth: z.string().optional(),
    payrollFreq: z.string().min(1),
    cutoffDay: z.string().min(1),
    disbursementDay: z.string().min(1),
    weekStart: z.string().min(1),
    timezone: z.string().min(1),
    workingDays: z.array(z.string()).min(1),
  }),

  preferences: z.object({
    currency: z.string().min(1),
    language: z.string().min(1),
    dateFormat: z.string().min(1),
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
