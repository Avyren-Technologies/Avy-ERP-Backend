import { ApiError } from './api-error';
import { HttpStatus } from '../types';
import type { ZodError } from 'zod';

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
}

export class ValidationError extends ApiError {
  public readonly details: ValidationErrorDetail[];

  constructor(details: ValidationErrorDetail[], message = 'Validation failed') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, true, 'VALIDATION_ERROR');
    this.details = details;
  }

  static fromZod(error: ZodError): ValidationError {
    const details: ValidationErrorDetail[] = error.issues.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      value: 'input' in err ? err.input : err.code,
    }));

    return new ValidationError(details);
  }

  static single(field: string, message: string, value?: any): ValidationError {
    return new ValidationError([{ field, message, value }]);
  }
}
