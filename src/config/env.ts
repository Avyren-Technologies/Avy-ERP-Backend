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
