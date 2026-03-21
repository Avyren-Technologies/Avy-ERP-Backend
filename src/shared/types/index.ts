// Common types used across the application

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string | undefined;
  error?: string | undefined;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  } | undefined;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  message?: string | undefined;
}

// Extend Express Request interface globally
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roleId: string;
        tenantId: string;
        companyId: string;
        employeeId?: string;
        permissions: string[];
        firstName?: string;
        lastName?: string;
      };
      tenant?: {
        id: string;
        schemaName: string;
        companyId: string;
        databaseUrl: string;
      };
    }
  }
}

export type RequestWithUser = Express.Request;
export type RequestWithTenant = Express.Request;

export interface UserContext {
  userId: string;
  tenantId: string;
  companyId: string;
  roleId: string;
  permissions: string[];
}

export interface TenantContext {
  tenantId: string;
  schemaName: string;
  companyId: string;
  databaseUrl: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface SMSMessage {
  to: string;
  message: string;
}

export interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

export interface DatabaseTransaction {
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

// Generic filter types
export interface FilterOptions {
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, any>;
  skip?: number;
  take?: number;
}

export interface SearchOptions extends FilterOptions {
  search?: string;
  searchFields?: string[];
}

// Generic CRUD operations
export interface CreateOptions<T = any> {
  data: T;
  include?: Record<string, any>;
}

export interface UpdateOptions<T = any> {
  where: Record<string, any>;
  data: Partial<T>;
  include?: Record<string, any>;
}

export interface DeleteOptions {
  where: Record<string, any>;
}

export interface FindOptions extends FilterOptions {
  select?: Record<string, any>;
}

export interface FindManyOptions extends FindOptions {
  cursor?: Record<string, any>;
  distinct?: string[];
}

// HTTP Status codes
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
}

// Common enums
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  TRIAL = 'trial',
  EXPIRED = 'expired',
}

export enum ModuleStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  TRIAL = 'trial',
}

export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum QueueType {
  REPORT = 'report',
  ANALYTICS = 'analytics',
  NOTIFICATION = 'notification',
  EMAIL = 'email',
  SMS = 'sms',
}

// Date and time utilities
export type DateString = string; // ISO 8601 format
export type Timestamp = number; // Unix timestamp
export type UUID = string;

// Generic entity types
export interface BaseEntity {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface SoftDeleteEntity extends BaseEntity {
  deletedAt?: Date;
  deletedBy?: string;
}