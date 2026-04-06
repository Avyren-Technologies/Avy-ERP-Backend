import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { ApiResponse, PaginatedResponse, HttpStatus } from '../types';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ID generation
export function generateId(): string {
  return uuidv4();
}

export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Response utilities
export function createSuccessResponse<T>(
  data: T,
  message?: string | undefined,
  statusCode = HttpStatus.OK
): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

export function createErrorResponse(
  error: string,
  message?: string | undefined,
  statusCode = HttpStatus.INTERNAL_SERVER_ERROR
): ApiResponse {
  return {
    success: false,
    error,
    message,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string | undefined
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    message,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

// Pagination utilities
export function getPaginationParams(query: any) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function getPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext,
    hasPrev,
  };
}

// Date utilities
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] || '';
}

export function formatDateTime(date: Date): string {
  return date.toISOString();
}

export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

export function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

export function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getDateDifference(startDate: Date, endDate: Date): number {
  const timeDiff = endDate.getTime() - startDate.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

// String utilities
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Array utilities
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function intersection<T>(array1: T[], array2: T[]): T[] {
  return array1.filter((item) => array2.includes(item));
}

export function difference<T>(array1: T[], array2: T[]): T[] {
  return array1.filter((item) => !array2.includes(item));
}

// Object utilities
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
}

export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (typeof obj === 'string' || Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Number utilities
export function roundToDecimal(num: number, decimals: number = 2): number {
  return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatPercentage(value: number, decimals = 2): string {
  return `${roundToDecimal(value * 100, decimals)}%`;
}

// Validation utilities
export function isEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

export function isStrongPassword(password: string): boolean {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

// File utilities
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function getFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function isValidFileType(filename: string, allowedTypes: string[]): boolean {
  const extension = getFileExtension(filename);
  return allowedTypes.includes(`.${extension}`);
}

// Search utilities
export function createSearchQuery(searchTerm: string, fields: string[]): any {
  if (!searchTerm || !fields.length) return {};

  const searchConditions = fields.map((field) => ({
    [field]: {
      contains: searchTerm,
      mode: 'insensitive',
    },
  }));

  return {
    OR: searchConditions,
  };
}

// OEE calculation
export function calculateOEE(availability: number, performance: number, quality: number): number {
  return roundToDecimal(availability * performance * quality, 4);
}

export function getOEECategory(oee: number): 'excellent' | 'good' | 'poor' {
  if (oee >= 0.85) return 'excellent';
  if (oee >= 0.6) return 'good';
  return 'poor';
}

// GST calculation utilities
export function calculateGST(amount: number, gstRate: number): { cgst: number; sgst: number; igst: number } {
  const gstAmount = roundToDecimal(amount * gstRate, 2);
  const halfGST = roundToDecimal(gstAmount / 2, 2);

  return {
    cgst: halfGST,
    sgst: halfGST,
    igst: gstAmount,
  };
}

export function calculateTotalWithGST(
  amount: number,
  gstType: 'intra' | 'inter',
  gstRate = 0.18
): { amount: number; cgst: number; sgst: number; igst: number; total: number } {
  const gst = calculateGST(amount, gstRate);

  return {
    amount: roundToDecimal(amount, 2),
    cgst: gstType === 'intra' ? gst.cgst : 0,
    sgst: gstType === 'intra' ? gst.sgst : 0,
    igst: gstType === 'inter' ? gst.igst : 0,
    total: roundToDecimal(amount + (gstType === 'intra' ? gst.cgst + gst.sgst : gst.igst), 2),
  };
}

// Async utilities
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attempts <= 1) {
      throw error;
    }
    await sleep(delay);
    return retry(fn, attempts - 1, delay * 2);
  }
}

// Cache key utilities
export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

function normalizeRedisKeyPart(part: string | number): string {
  return String(part).trim().replace(/^:+|:+$/g, '');
}

function getRedisPrefixParts(): string[] {
  return env.REDIS_KEY_PREFIX
    .split(':')
    .map(normalizeRedisKeyPart)
    .filter(Boolean);
}

export function getRedisModulePrefix(moduleName: string, ...additional: (string | number)[]): string {
  return createCacheKey(
    ...getRedisPrefixParts(),
    normalizeRedisKeyPart(moduleName),
    ...additional.map(normalizeRedisKeyPart).filter(Boolean),
  );
}

export function createRedisKey(moduleName: string, ...parts: (string | number)[]): string {
  return createCacheKey(
    ...getRedisPrefixParts(),
    normalizeRedisKeyPart(moduleName),
    ...parts.map(normalizeRedisKeyPart).filter(Boolean),
  );
}

export function createRedisPattern(moduleName: string, ...parts: string[]): string {
  return createCacheKey(
    ...getRedisPrefixParts(),
    normalizeRedisKeyPart(moduleName),
    ...parts.map((part) => part.trim()).filter(Boolean),
  );
}

export function createUserCacheKey(userId: string, ...additional: string[]): string {
  return createRedisKey('auth', 'user', userId, ...additional);
}

export function createTenantCacheKey(tenantId: string, ...additional: string[]): string {
  return createRedisKey('tenant', tenantId, ...additional);
}

export function createAccessTokenBlacklistKey(token: string): string {
  return createRedisKey('auth', 'token', 'blacklist', token);
}

export function createRefreshTokenBlacklistKey(token: string): string {
  return createRedisKey('auth', 'token', 'refresh-blacklist', token);
}

export function createUserPermissionsCacheKey(userId: string, tenantId: string): string {
  return createRedisKey('rbac', 'user', userId, 'tenant', tenantId, 'permissions');
}

export function createModuleConfigCacheKey(tenantId: string, moduleName: string): string {
  return createRedisKey('modules', 'config', tenantId, moduleName);
}

export function createAnalyticsCacheKey(type: string, tenantId: string, period: string): string {
  return createRedisKey('analytics', type, tenantId, period);
}

export function createReportCacheKey(type: string, tenantId: string, reportId: string | number): string {
  return createRedisKey('reports', type, tenantId, reportId);
}

export function createStoredReportCacheKey(reportId: string): string {
  return createRedisKey('reports', 'data', reportId);
}

export function createRootRedisPattern(): string {
  return `${env.REDIS_KEY_PREFIX}:*`;
}

// Prisma helpers
export { n } from './prisma-helpers';

// Number series
export { generateNextNumber } from './number-series';
