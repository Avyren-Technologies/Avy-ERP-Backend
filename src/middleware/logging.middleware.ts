import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log incoming request
  logger.info('Incoming Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    tenantId: (req as any).tenant?.id,
    query: req.query,
    body: env.NODE_ENV === 'development' ? req.body : undefined,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log response
    logger.info('Outgoing Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.id,
      tenantId: (req as any).tenant?.id,
    });
  });

  next();
}

export function auditLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip audit logging for certain routes
  const skipAuditRoutes = [
    '/health',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/favicon.ico',
  ];

  if (skipAuditRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }

  const auditEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    tenantId: (req as any).tenant?.id,
    userEmail: (req as any).user?.email,
    companyId: (req as any).user?.companyId,
  };

  // Log audit entry
  logger.info('Audit Log', auditEntry);

  next();
}

// Performance monitoring middleware
export function performanceMonitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    // Log slow requests (> 1000ms)
    if (duration > 1000) {
      logger.warn('Slow Request Detected', {
        method: req.method,
        url: req.originalUrl,
        duration: `${duration.toFixed(2)}ms`,
        userId: (req as any).user?.id,
        tenantId: (req as any).tenant?.id,
      });
    }

    // Log very slow requests (> 5000ms)
    if (duration > 5000) {
      logger.error('Very Slow Request Detected', {
        method: req.method,
        url: req.originalUrl,
        duration: `${duration.toFixed(2)}ms`,
        userId: (req as any).user?.id,
        tenantId: (req as any).tenant?.id,
        query: req.query,
        body: env.NODE_ENV === 'development' ? req.body : undefined,
      });
    }
  });

  next();
}

// Rate limiting logging middleware
export function rateLimitLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if request was rate limited
  if (res.statusCode === 429) {
    logger.warn('Rate Limit Exceeded', {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
      tenantId: (req as any).tenant?.id,
    });
  }

  next();
}

// Security logging middleware
export function securityLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection attempts
    /eval\(/i, // Code injection attempts
  ];

  const requestData = JSON.stringify({
    url: req.originalUrl,
    query: req.query,
    body: req.body,
    headers: req.headers,
  });

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));

  if (isSuspicious) {
    logger.error('Suspicious Request Detected', {
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
      tenantId: (req as any).tenant?.id,
      query: req.query,
      body: req.body,
    });
  }

  next();
}