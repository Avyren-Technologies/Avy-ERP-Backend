// Tenant onboarding types — mirrors the frontend wizard payload

export interface OnboardTenantPayload {
  // Step 1: Identity
  identity: {
    displayName: string;
    legalName: string;
    businessType: string;
    industry: string;
    companyCode: string;
    shortName?: string;
    incorporationDate?: string;
    employeeCount?: string;
    cin?: string;
    website?: string;
    emailDomain: string;
    logoUrl?: string;
    wizardStatus?: string; // Draft | Pilot | Active
  };

  // Step 2: Statutory
  statutory: {
    pan: string;
    tan?: string;
    gstin?: string;
    pfRegNo?: string;
    esiCode?: string;
    ptReg?: string;
    lwfrNo?: string;
    rocState?: string;
  };

  // Step 3: Address
  address: {
    registered: AddressBlock;
    sameAsRegistered: boolean;
    corporate?: AddressBlock;
  };

  // Step 4: Fiscal
  fiscal: {
    fyType: string;
    fyCustomStartMonth?: string;
    fyCustomEndMonth?: string;
    payrollFreq: string;
    cutoffDay: string;
    disbursementDay: string;
    weekStart: string;
    timezone: string;
    workingDays: string[];
  };

  // Step 5: Preferences
  preferences: {
    currency: string;
    language: string;
    dateFormat: string;
    numberFormat?: string;
    timeFormat?: string;
    indiaCompliance: boolean;
    multiCurrency?: boolean;
    ess?: boolean;
    mobileApp: boolean;
    webApp: boolean;
    systemApp?: boolean;
    aiChatbot?: boolean;
    eSign?: boolean;
    biometric: boolean;
    bankIntegration: boolean;
    emailNotif: boolean;
    whatsapp?: boolean;
    razorpayEnabled?: boolean;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    razorpayWebhookSecret?: string;
    razorpayAccountNumber?: string;
    razorpayAutoDisbursement?: boolean;
    razorpayTestMode?: boolean;
  };

  // Step 6: Endpoint
  endpoint: {
    endpointType: 'default' | 'custom';
    customBaseUrl?: string;
  };

  // Step 7: Strategy
  strategy: {
    multiLocationMode: boolean;
    locationConfig: 'common' | 'per-location';
  };

  // Locations (Step 8)
  locations: LocationPayload[];

  // Company-level commercial (when locationConfig === 'common')
  commercial?: CommercialPayload;

  // Contacts (Step 11)
  contacts: ContactPayload[];

  // Shifts (Step 12)
  shifts: {
    dayStartTime?: string;
    dayEndTime?: string;
    weeklyOffs?: string[];
    items: ShiftItemPayload[];
  };

  // No. Series (Step 13)
  noSeries: NoSeriesPayload[];

  // IOT Reasons (Step 14)
  iotReasons: IotReasonPayload[];

  // Controls (Step 15)
  controls: {
    ncEditMode?: boolean;
    loadUnload?: boolean;
    cycleTime?: boolean;
    payrollLock?: boolean;
    leaveCarryForward?: boolean;
    overtimeApproval?: boolean;
    mfa?: boolean;
  };

  // Users (Step 16)
  users: UserPayload[];
}

// Sub-types

export interface AddressBlock {
  line1: string;
  line2?: string;
  city: string;
  district?: string;
  state: string;
  pin: string;
  country: string;
  stdCode?: string;
}

export interface LocationPayload {
  name: string;
  code: string;
  facilityType: string;
  customFacilityType?: string;
  status: string;
  isHQ: boolean;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  pin?: string;
  country?: string;
  stdCode?: string;
  gstin?: string;
  stateGST?: string;
  contactName?: string;
  contactDesignation?: string;
  contactEmail?: string;
  contactCountryCode?: string;
  contactPhone?: string;
  geoEnabled: boolean;
  geoLocationName?: string;
  geoLat?: string;
  geoLng?: string;
  geoRadius?: number;
  geoShape?: string;
  // Per-location commercial (Steps 9-10)
  moduleIds?: string[];
  customModulePricing?: Record<string, number>;
  userTier?: string;
  customUserLimit?: string;
  customTierPrice?: string;
  billingCycle?: string;
  trialDays?: number;
}

export interface CommercialPayload {
  selectedModuleIds?: string[];
  customModulePricing?: Record<string, number>;
  userTier?: string;
  customUserLimit?: string;
  customTierPrice?: string;
  billingCycle?: string;
  trialDays?: number;
}

export interface ContactPayload {
  name: string;
  designation?: string;
  department?: string;
  type: string;
  email: string;
  countryCode?: string;
  mobile: string;
  linkedin?: string;
}

export interface ShiftItemPayload {
  name: string;
  fromTime: string;
  toTime: string;
  noShuffle?: boolean;
  downtimeSlots?: Array<{ type: string; duration: string }>;
}

export interface NoSeriesPayload {
  code: string;
  linkedScreen: string;
  description?: string;
  prefix: string;
  suffix?: string;
  numberCount?: number;
  startNumber?: number;
}

export interface IotReasonPayload {
  reasonType: string;
  reason: string;
  description?: string;
  department?: string;
  planned?: boolean;
  duration?: string;
}

export interface UserPayload {
  fullName: string;
  username: string;
  password: string;
  role: string;
  email: string;
  mobile?: string;
  department?: string;
}

// Section keys for partial updates
export type CompanySectionKey =
  | 'identity'
  | 'statutory'
  | 'address'
  | 'fiscal'
  | 'preferences'
  | 'endpoint'
  | 'strategy'
  | 'controls'
  | 'locations'
  | 'contacts'
  | 'shifts'
  | 'noSeries'
  | 'iotReasons'
  | 'users'
  | 'commercial';

// Dashboard stats
export interface SuperAdminDashboardStats {
  activeCompanies: number;
  totalUsers: number;
  monthlyRevenue: number;
  activeModules: number;
  tenantOverview: {
    active: number;
    trial: number;
    suspended: number;
    expired: number;
  };
}
