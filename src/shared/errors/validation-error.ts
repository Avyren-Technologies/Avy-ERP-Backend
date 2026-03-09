import { ApiError } from './api-error';
import { HttpStatus } from '../types';

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

  static fromJoi(error: any): ValidationError {
    const details: ValidationErrorDetail[] = error.details.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value,
    }));

    return new ValidationError(details);
  }

  static fromZod(error: any): ValidationError {
    const details: ValidationErrorDetail[] = error.errors.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.code,
    }));

    return new ValidationError(details);
  }

  static single(field: string, message: string, value?: any): ValidationError {
    return new ValidationError([{ field, message, value }]);
  }
}