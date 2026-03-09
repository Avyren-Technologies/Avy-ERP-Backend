import { ApiError } from './api-error';
import { HttpStatus } from '../types';

export class AuthError extends ApiError {
  constructor(message: string, code?: string) {
    super(message, HttpStatus.UNAUTHORIZED, true, code || 'AUTH_ERROR');
  }

  static invalidCredentials(): AuthError {
    return new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  static tokenExpired(): AuthError {
    return new AuthError('Token has expired', 'TOKEN_EXPIRED');
  }

  static invalidToken(): AuthError {
    return new AuthError('Invalid token', 'INVALID_TOKEN');
  }

  static missingToken(): AuthError {
    return new AuthError('Authentication token required', 'MISSING_TOKEN');
  }

  static insufficientPermissions(): AuthError {
    return new AuthError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');
  }

  static accountSuspended(): AuthError {
    return new AuthError('Account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  static accountInactive(): AuthError {
    return new AuthError('Account is not active', 'ACCOUNT_INACTIVE');
  }

  static tenantNotFound(): AuthError {
    return new AuthError('Tenant not found', 'TENANT_NOT_FOUND');
  }

  static tenantSuspended(): AuthError {
    return new AuthError('Tenant has been suspended', 'TENANT_SUSPENDED');
  }
}