import { Request, Response, NextFunction } from 'express';
import { ApiError, ValidationError } from '../shared/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { HttpStatus } from '../shared/types';

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let code: string | undefined;

  // Handle known error types
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;
  } else if (error instanceof ValidationError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    // Mongoose cast error
    statusCode = HttpStatus.BAD_REQUEST;
    message = 'Invalid data format';
    code = 'INVALID_DATA';
  } else if ((error as any).code === 'P1001') {
    // Prisma connection error
    statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    message = 'Database connection error';
    code = 'DB_CONNECTION_ERROR';
  } else if ((error as any).code === 'P2002') {
    // Prisma unique constraint error
    statusCode = HttpStatus.CONFLICT;
    message = 'Duplicate entry';
    code = 'DUPLICATE_ENTRY';
  } else if ((error as any).code === 'P2025') {
    // Prisma record not found
    statusCode = HttpStatus.NOT_FOUND;
    message = 'Record not found';
    code = 'NOT_FOUND';
  } else if (error.constructor?.name === 'PrismaClientValidationError') {
    // Prisma client validation error (invalid enum values, missing fields, type mismatches)
    statusCode = HttpStatus.BAD_REQUEST;
    message = 'Invalid data: ' + error.message.split('\n').pop()?.trim();
    code = 'VALIDATION_ERROR';
  }

  // Log error
  const errorLog = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    tenantId: (req as any).tenant?.id,
    timestamp: new Date().toISOString(),
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', errorLog);
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', errorLog);
  }

  // Send error response
  const response: any = {
    success: false,
    error: message,
  };

  if (code) {
    response.code = code;
  }

  // Include validation details for validation errors
  if (error instanceof ValidationError) {
    response.details = error.details;
  }

  // Include stack trace in development
  if (env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
}

export function notFoundMiddleware(req: Request, res: Response, next: NextFunction): void {
  const error = new ApiError(`Route ${req.originalUrl} not found`, HttpStatus.NOT_FOUND);
  next(error);
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Health check middleware
export function healthCheckMiddleware(req: Request, res: Response): void {
  res.status(HttpStatus.OK).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
}