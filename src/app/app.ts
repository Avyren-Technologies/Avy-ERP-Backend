import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  errorMiddleware,
  notFoundMiddleware,
  healthCheckMiddleware
} from '../middleware/error.middleware';
import {
  requestLoggingMiddleware,
  auditLoggingMiddleware,
  performanceMonitoringMiddleware,
  securityLoggingMiddleware,
  rateLimitLoggingMiddleware
} from '../middleware/logging.middleware';
import { routes } from './routes';

// Create Express application
const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration — dynamic origin validation for wildcard subdomains
if (env.ENABLE_CORS) {
  const mainDomain = env.MAIN_DOMAIN;
  const mainOrigin = `https://${mainDomain}`;
  const escapedMainDomain = mainDomain.replace(/\./g, '\\.');
  const subdomainPortPattern = env.NODE_ENV === 'development' ? '(?::\\d+)?' : '';
  const subdomainPattern = new RegExp(
    `^https:\\/\\/[a-z0-9-]+\\.${escapedMainDomain}${subdomainPortPattern}$`
  );

  // Additional origins from env (for development)
  const extraOrigins = env.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowAll = extraOrigins.includes('*');

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Development wildcard
      if (allowAll) return callback(null, true);

      // Main domain
      if (origin === mainOrigin) return callback(null, true);

      // Also allow http variant in development
      if (env.NODE_ENV === 'development' && origin === `http://${mainDomain}`) {
        return callback(null, true);
      }

      // Wildcard subdomains (e.g., https://company1.avyerp.avyren.in)
      if (subdomainPattern.test(origin)) return callback(null, true);

      // Extra configured origins (dev/staging)
      if (extraOrigins.includes(origin)) return callback(null, true);

      // Development mode: allow all when no origins configured
      if (env.NODE_ENV === 'development' && extraOrigins.length === 0) {
        return callback(null, true);
      }

      logger.warn(`CORS rejected origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Requested-With',
      'X-Device-Info',
    ],
  }));
}

// Rate limiting
const enableRateLimiting = env.NODE_ENV !== 'development';

if (enableRateLimiting) {
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
  });

  app.use(limiter);

  const authLoginLimiter = rateLimit({
    windowMs: env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: 'Too many login attempts. Please try again later.',
      code: 'AUTH_LOGIN_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authRegisterLimiter = rateLimit({
    windowMs: env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: 'Too many registration attempts. Please try again later.',
      code: 'AUTH_REGISTER_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authRefreshLimiter = rateLimit({
    windowMs: env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_REFRESH_RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: 'Too many token refresh attempts. Please try again later.',
      code: 'AUTH_REFRESH_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Forgot password rate limiter (env-driven)
  const authForgotPasswordLimiter = rateLimit({
    windowMs: env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: 'Too many password reset attempts. Please try again later.',
      code: 'AUTH_FORGOT_PASSWORD_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Strict auth endpoint-specific rate limiting
  app.use(`${env.API_PREFIX}/auth/login`, authLoginLimiter);
  app.use(`${env.API_PREFIX}/auth/register`, authRegisterLimiter);
  app.use(`${env.API_PREFIX}/auth/refresh-token`, authRefreshLimiter);
  app.use(`${env.API_PREFIX}/auth/forgot-password`, authForgotPasswordLimiter);
  app.use(`${env.API_PREFIX}/auth/verify-reset-code`, authForgotPasswordLimiter);
  app.use(`${env.API_PREFIX}/auth/reset-password`, authForgotPasswordLimiter);

  // Rate limit: company registration — 3 per IP per hour
  app.use(`${env.API_PREFIX}/auth/register-company`, rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { success: false, message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Rate limit: tenant branding — 10 per IP per minute
  app.use(`${env.API_PREFIX}/auth/tenant-branding`, rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

// Logging middleware
app.use(requestLoggingMiddleware);
app.use(auditLoggingMiddleware);
app.use(performanceMonitoringMiddleware);
app.use(securityLoggingMiddleware);
app.use(rateLimitLoggingMiddleware);

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req: any, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  },
}));

app.use(express.urlencoded({
  extended: true,
  limit: '100mb',
}));

// Cookie parser
app.use(cookieParser());

// Health check endpoint
app.get('/health', healthCheckMiddleware);

// API routes
app.use(env.API_PREFIX, routes);

// 404 handler
app.use(notFoundMiddleware);

// Error handling middleware (must be last)
app.use(errorMiddleware);

export { app };