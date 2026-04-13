// Application constants

export const APP_CONSTANTS = {
  // API
  API_PREFIX: '/api/v1',
  API_VERSION: 'v1',

  // Pagination
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,

  // File upload
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],

  // Password
  MIN_PASSWORD_LENGTH: 8,
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,

  // JWT
  JWT_COOKIE_NAME: 'avy_erp_token',
  REFRESH_TOKEN_COOKIE_NAME: 'avy_erp_refresh_token',

  // Cache TTL (in seconds)
  CACHE_TTL: {
    USER_SESSION: 3600, // 1 hour
    TENANT_CONFIG: 86400, // 24 hours
    MODULE_CONFIG: 3600, // 1 hour
    PERMISSIONS: 1800, // 30 minutes
  },

  // Queue settings
  QUEUE: {
    DEFAULT_PRIORITY: 0,
    HIGH_PRIORITY: 10,
    MAX_RETRIES: 3,
    BACKOFF_DELAY: 5000, // 5 seconds
  },

  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100,
    STRICT_MAX_REQUESTS: 10,
  },

  // Database
  DB_CONNECTION_TIMEOUT: 10000, // 10 seconds
  DB_QUERY_TIMEOUT: 30000, // 30 seconds

  // Modules
  CORE_MODULES: [
    'auth',
    'tenant',
    'company',
    'billing',
    'rbac',
  ],

  BUSINESS_MODULES: [
    'hr',
    'production',
    'machines',
    'inventory',
    'visitors',
    'maintenance',
    'reports',
  ],

  // Roles
  SYSTEM_ROLES: {
    SUPER_ADMIN: 'super-admin',
    COMPANY_ADMIN: 'company-admin',
  },

  // Permissions
  PERMISSIONS: {
    // User management
    USER_CREATE: 'user:create',
    USER_READ: 'user:read',
    USER_UPDATE: 'user:update',
    USER_DELETE: 'user:delete',

    // Role management
    ROLE_CREATE: 'role:create',
    ROLE_READ: 'role:read',
    ROLE_UPDATE: 'role:update',
    ROLE_DELETE: 'role:delete',

    // Company management
    COMPANY_READ: 'company:read',
    COMPANY_UPDATE: 'company:update',

    // Module management
    MODULE_READ: 'module:read',
    MODULE_UPDATE: 'module:update',

    // Billing
    BILLING_READ: 'billing:read',
    BILLING_UPDATE: 'billing:update',

    // Reports
    REPORT_READ: 'report:read',
    REPORT_CREATE: 'report:create',
    REPORT_DELETE: 'report:delete',

    // Audit
    AUDIT_READ: 'audit:read',
  },

  // GST
  GST_RATES: {
    CGST: 0.09, // 9%
    SGST: 0.09, // 9%
    IGST: 0.18, // 18%
  },

  // OEE calculation
  OEE_THRESHOLDS: {
    EXCELLENT: 0.85, // 85%
    GOOD: 0.60, // 60%
    POOR: 0.60, // Below 60%
  },

  // Time constants
  TIME: {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
  },

  // Email templates
  EMAIL_TEMPLATES: {
    WELCOME: 'welcome',
    PASSWORD_RESET: 'password-reset',
    INVITATION: 'invitation',
    BILLING_REMINDER: 'billing-reminder',
    LEAVE_APPROVAL: 'leave-approval',
    BREAKDOWN_ALERT: 'breakdown-alert',
  },

  // SMS templates
  SMS_TEMPLATES: {
    WELCOME: 'welcome',
    OTP: 'otp',
    ALERT: 'alert',
    REMINDER: 'reminder',
  },

  // Notification priorities
  NOTIFICATION_PRIORITY: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent',
  },

  // Shift timings (default)
  DEFAULT_SHIFTS: {
    MORNING: { start: '06:00', end: '14:00' },
    EVENING: { start: '14:00', end: '22:00' },
    NIGHT: { start: '22:00', end: '06:00' },
  },

  // Attendance thresholds
  ATTENDANCE_THRESHOLDS: {
    FULL_DAY: 8, // hours
    HALF_DAY: 4, // hours
    ABSENT: 0,
  },

  // Production metrics
  PRODUCTION_METRICS: {
    EFFICIENCY_TARGET: 0.95, // 95%
    SCRAP_TARGET: 0.02, // 2%
    OEE_TARGET: 0.85, // 85%
  },

  // Maintenance intervals
  MAINTENANCE_INTERVALS: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    HALF_YEARLY: 'half-yearly',
    YEARLY: 'yearly',
  },

  // Inventory levels
  INVENTORY_LEVELS: {
    CRITICAL: 0.1, // 10% of reorder point
    LOW: 0.25, // 25% of reorder point
    NORMAL: 0.5, // 50% of reorder point
  },

  // Visitor management
  VISITOR_STATUSES: {
    EXPECTED: 'EXPECTED',
    ARRIVED: 'ARRIVED',
    CHECKED_IN: 'CHECKED_IN',
    CHECKED_OUT: 'CHECKED_OUT',
    NO_SHOW: 'NO_SHOW',
    CANCELLED: 'CANCELLED',
    REJECTED: 'REJECTED',
    AUTO_CHECKED_OUT: 'AUTO_CHECKED_OUT',
  },

  // Report types
  REPORT_TYPES: {
    SALES: 'sales',
    INVENTORY: 'inventory',
    PRODUCTION: 'production',
    HR: 'hr',
    FINANCE: 'finance',
    MAINTENANCE: 'maintenance',
    VISITORS: 'visitors',
  },

  // Export formats
  EXPORT_FORMATS: {
    PDF: 'pdf',
    EXCEL: 'xlsx',
    CSV: 'csv',
  },

  // Currencies
  CURRENCIES: {
    INR: 'INR',
    USD: 'USD',
    EUR: 'EUR',
    GBP: 'GBP',
  },

  // Languages
  LANGUAGES: {
    EN: 'en',
    HI: 'hi',
    // Add more as needed
  },
} as const;

// Export individual constants for easier importing
export const {
  API_PREFIX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  MIN_PASSWORD_LENGTH,
  CACHE_TTL,
  QUEUE,
  RATE_LIMIT,
  PERMISSIONS,
  GST_RATES,
  TIME,
} = APP_CONSTANTS;

// Linked screens for Number Series
export { LINKED_SCREENS, VALID_LINKED_SCREEN_VALUES, isValidLinkedScreen } from './linked-screens';
export type { LinkedScreenOption } from './linked-screens';