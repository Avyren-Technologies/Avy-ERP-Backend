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

// CORS configuration
if (env.ENABLE_CORS) {
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);

      // In production, check against allowed origins
      if (env.NODE_ENV === 'production') {
        const allowedOrigins = [
          'https://avyerp.com',
          'https://www.avyerp.com',
          'https://app.avyerp.com',
        ];

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'), false);
      }

      // In development, allow all origins
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Requested-With',
    ],
  }));
}

// Rate limiting
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
  limit: '10mb',
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