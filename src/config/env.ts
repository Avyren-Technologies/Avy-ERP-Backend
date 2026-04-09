import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

// Environment schema validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string(),
  DATABASE_URL_TEMPLATE: z.string(),

  // Redis
  REDIS_URL: z.string(),
  REDIS_KEY_PREFIX: z.string().default('avy:erp-backend'),
  REDIS_CACHE_DB: z.coerce.number().default(0),
  REDIS_QUEUE_DB: z.coerce.number().default(1),

  // JWT
  JWT_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_COOKIE_NAME: z.string().default('avy_erp_token'),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().default('noreply@avyerp.com'),
  FROM_NAME: z.string().default('Avy ERP'),

  // SMS
  SMS_API_KEY: z.string().optional(),
  SMS_API_URL: z.string().optional(),

  // Storage
  STORAGE_TYPE: z.enum(['local', 's3', 'azure']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY: z.string().optional(),
  AWS_SECRET_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('avy-erp-files'),
  R2_ENDPOINT: z.string().optional(),
  R2_UPLOAD_URL_EXPIRY_SECONDS: z.coerce.number().default(300),
  R2_DOWNLOAD_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),

  // File Upload Limits (bytes)
  UPLOAD_MAX_IMAGE_SIZE: z.coerce.number().default(5242880),
  UPLOAD_MAX_DOCUMENT_SIZE: z.coerce.number().default(10485760),

  // Application
  APP_NAME: z.string().default('Avy ERP'),
  APP_URL: z.string().default('http://localhost:3000'),
  API_PREFIX: z.string().default('/api/v1'),

  // Security
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(5),
  AUTH_REGISTER_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(3600000),
  AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(5),
  AUTH_REFRESH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  AUTH_REFRESH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(20),
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(3600000),
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(5),

  // File Upload
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  ALLOWED_FILE_TYPES: z.string().default('.jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // Queue
  QUEUE_REMOVE_ON_COMPLETE: z.coerce.number().default(50),
  QUEUE_REMOVE_ON_FAIL: z.coerce.number().default(100),

  // Features
  ENABLE_SWAGGER: envBoolean.default(false),
  ENABLE_CORS: envBoolean.default(true),
  CORS_ALLOWED_ORIGINS: z.string().default(''),

  // Multi-tenancy
  MAIN_DOMAIN: z.string().default('avyren.in'),
  TENANT_CLIENT_CACHE_SIZE: z.coerce.number().default(50),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),

  // Notifications
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  NOTIFICATIONS_ENABLED: envBoolean.default(true),
  NOTIFICATIONS_DEDUP_TTL_SEC: z.coerce.number().default(60),
  NOTIFICATIONS_IDEMPOTENCY_TTL_SEC: z.coerce.number().default(86400),
  NOTIFICATIONS_BATCH_THRESHOLD: z.coerce.number().default(5),
  NOTIFICATIONS_BATCH_WINDOW_SEC: z.coerce.number().default(300),
  NOTIFICATIONS_MAX_QUEUE_LOW: z.coerce.number().default(10000),
  NOTIFICATIONS_MAX_QUEUE_DEFAULT: z.coerce.number().default(50000),
  NOTIFICATIONS_RECEIPT_POLL_SEC: z.coerce.number().default(30),
  NOTIFICATIONS_RECEIPT_MAX_AGE_MIN: z.coerce.number().default(15),
  NOTIFICATIONS_DLQ_RETENTION_DAYS: z.coerce.number().default(7),

  // Twilio (SMS provider)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

  // Meta Cloud API (WhatsApp provider)
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // Notification feature flags (Phase 1A)
  NOTIFICATIONS_CRON_ENABLED: envBoolean.default(true),
  NOTIFICATIONS_SMS_ENABLED: envBoolean.default(true),
  NOTIFICATIONS_WHATSAPP_ENABLED: envBoolean.default(true),
  NOTIFICATIONS_SMS_DRY_RUN: envBoolean.default(false),
  NOTIFICATIONS_WHATSAPP_DRY_RUN: envBoolean.default(false),

  // Operational safeguards (Phase 1A)
  NOTIFICATIONS_USER_RATE_LIMIT_PER_MIN: z.coerce.number().default(20),
  NOTIFICATIONS_TENANT_RATE_LIMIT_PER_MIN: z.coerce.number().default(1000),
  NOTIFICATIONS_BULK_CHUNK_SIZE: z.coerce.number().default(50),
  NOTIFICATIONS_BULK_MIN_RECIPIENTS: z.coerce.number().default(20),
  NOTIFICATIONS_BULK_QUEUE_HIGH_WATER: z.coerce.number().default(5000),
  NOTIFICATIONS_CONSENT_CACHE_TTL_SEC: z.coerce.number().default(300),
  NOTIFICATIONS_SMS_DAILY_CAP_PER_TENANT: z.coerce.number().default(500),
  NOTIFICATIONS_SMS_DAILY_CAP_PER_USER: z.coerce.number().default(10),
  NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_TENANT: z.coerce.number().default(500),
  NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_USER: z.coerce.number().default(10),
  NOTIFICATIONS_EVENT_RETENTION_DAYS: z.coerce.number().default(90),
  NOTIFICATIONS_CRON_COMPANY_CONCURRENCY: z.coerce.number().default(5),
  NOTIFICATIONS_CRON_JITTER_MS: z.coerce.number().default(60000),
  NOTIFICATIONS_METRICS_ENABLED: envBoolean.default(true),
});

// Parse and validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment variables:', error);
  process.exit(1);
}

export { env };
