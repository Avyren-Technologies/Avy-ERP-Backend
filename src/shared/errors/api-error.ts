import { HttpStatus } from '../types';

export class ApiError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly isOperational: boolean;
  public readonly code?: string | undefined;

  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    isOperational = true,
    code?: string | undefined
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string): ApiError {
    return new ApiError(message, HttpStatus.BAD_REQUEST, true, code);
  }

  static unauthorized(message = 'Unauthorized access', code?: string): ApiError {
    return new ApiError(message, HttpStatus.UNAUTHORIZED, true, code);
  }

  static forbidden(message = 'Forbidden access', code?: string): ApiError {
    return new ApiError(message, HttpStatus.FORBIDDEN, true, code);
  }

  static notFound(message = 'Resource not found', code?: string): ApiError {
    return new ApiError(message, HttpStatus.NOT_FOUND, true, code);
  }

  static conflict(message: string, code?: string): ApiError {
    return new ApiError(message, HttpStatus.CONFLICT, true, code);
  }

  static unprocessableEntity(message: string, code?: string): ApiError {
    return new ApiError(message, HttpStatus.UNPROCESSABLE_ENTITY, true, code);
  }

  static internal(message = 'Internal server error', code?: string): ApiError {
    return new ApiError(message, HttpStatus.INTERNAL_SERVER_ERROR, true, code);
  }
}