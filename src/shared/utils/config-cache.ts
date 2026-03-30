/**
 * Config Cache Helpers
 *
 * Cached getters for all HRMS configuration models with the following pattern:
 *   1. Try Redis cache
 *   2. On miss: read from DB
 *   3. If DB returns null: auto-seed defaults (for company-level singletons)
 *   4. Write result to Redis cache (30min TTL)
 *   5. Return result
 *
 * Redis failures are non-fatal — log a warning and fall through to DB.
 * Cache write failures are non-fatal — log a warning and continue.
 */

import type {
  CompanySettings,
  SystemControls,
  AttendanceRule,
  OvertimeRule,
  ESSConfig,
  CompanyShift,
  Location,
  ShiftBreak,
} from '@prisma/client';

import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { createRedisKey } from './index';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Cache TTL in seconds: 30 minutes */
const CONFIG_CACHE_TTL = 1800;

/** Module prefix for all config cache keys */
const CONFIG_MODULE = 'config';

// ─── Cache Key Builders ──────────────────────────────────────────────────────

function systemControlsKey(companyId: string): string {
  return createRedisKey(CONFIG_MODULE, 'system-controls', companyId);
}

function attendanceRulesKey(companyId: string): string {
  return createRedisKey(CONFIG_MODULE, 'attendance-rules', companyId);
}

function overtimeRulesKey(companyId: string): string {
  return createRedisKey(CONFIG_MODULE, 'overtime-rules', companyId);
}

function essConfigKey(companyId: string): string {
  return createRedisKey(CONFIG_MODULE, 'ess-config', companyId);
}

function companySettingsKey(companyId: string): string {
  return createRedisKey(CONFIG_MODULE, 'company-settings', companyId);
}

function shiftKey(shiftId: string): string {
  return createRedisKey(CONFIG_MODULE, 'shift', shiftId);
}

function locationKey(locationId: string): string {
  return createRedisKey(CONFIG_MODULE, 'location', locationId);
}

function shiftBreaksKey(shiftId: string): string {
  return createRedisKey(CONFIG_MODULE, 'shift-breaks', shiftId);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Try to read a cached value from Redis. Returns null on miss or error.
 * Redis failures are logged as warnings and treated as cache misses.
 */
async function tryReadCache<T>(key: string, label: string): Promise<T | null> {
  try {
    const cached = await cacheRedis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Redis read failed for ${label} (key=${key}): ${message}, falling through to DB`);
  }
  return null;
}

/**
 * Try to write a value to Redis cache. Failures are non-fatal.
 */
async function tryWriteCache(key: string, value: unknown, label: string): Promise<void> {
  try {
    await cacheRedis.set(key, JSON.stringify(value), 'EX', CONFIG_CACHE_TTL);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Redis write failed for ${label} (key=${key}): ${message}, continuing without cache`);
  }
}

/**
 * Try to delete a cached key from Redis. Failures are non-fatal.
 */
async function tryDeleteCache(key: string, label: string): Promise<void> {
  try {
    await cacheRedis.del(key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Redis delete failed for ${label} (key=${key}): ${message}`);
  }
}

// ─── Cached Getters ──────────────────────────────────────────────────────────

/**
 * Get cached SystemControls for a company.
 * Auto-seeds with Prisma defaults if no record exists (uses create with only companyId).
 */
export async function getCachedSystemControls(companyId: string): Promise<SystemControls> {
  const key = systemControlsKey(companyId);

  const cached = await tryReadCache<SystemControls>(key, 'system-controls');
  if (cached) return cached;

  let controls = await platformPrisma.systemControls.findUnique({ where: { companyId } });
  if (!controls) {
    logger.info(`SystemControls missing for company ${companyId}, auto-seeding defaults`);
    controls = await platformPrisma.systemControls.create({ data: { companyId } });
  }

  await tryWriteCache(key, controls, 'system-controls');
  return controls;
}

/**
 * Get cached AttendanceRule for a company.
 * Auto-seeds with Prisma defaults if no record exists.
 */
export async function getCachedAttendanceRules(companyId: string): Promise<AttendanceRule> {
  const key = attendanceRulesKey(companyId);

  const cached = await tryReadCache<AttendanceRule>(key, 'attendance-rules');
  if (cached) return cached;

  let rules = await platformPrisma.attendanceRule.findUnique({ where: { companyId } });
  if (!rules) {
    logger.info(`AttendanceRule missing for company ${companyId}, auto-seeding defaults`);
    rules = await platformPrisma.attendanceRule.create({ data: { companyId } });
  }

  await tryWriteCache(key, rules, 'attendance-rules');
  return rules;
}

/**
 * Get cached OvertimeRule for a company.
 * Auto-seeds with Prisma defaults if no record exists.
 */
export async function getCachedOvertimeRules(companyId: string): Promise<OvertimeRule> {
  const key = overtimeRulesKey(companyId);

  const cached = await tryReadCache<OvertimeRule>(key, 'overtime-rules');
  if (cached) return cached;

  let rules = await platformPrisma.overtimeRule.findUnique({ where: { companyId } });
  if (!rules) {
    logger.info(`OvertimeRule missing for company ${companyId}, auto-seeding defaults`);
    rules = await platformPrisma.overtimeRule.create({ data: { companyId } });
  }

  await tryWriteCache(key, rules, 'overtime-rules');
  return rules;
}

/**
 * Get cached ESSConfig for a company.
 * Auto-seeds with Prisma defaults if no record exists.
 */
export async function getCachedESSConfig(companyId: string): Promise<ESSConfig> {
  const key = essConfigKey(companyId);

  const cached = await tryReadCache<ESSConfig>(key, 'ess-config');
  if (cached) return cached;

  let config = await platformPrisma.eSSConfig.findUnique({ where: { companyId } });
  if (!config) {
    logger.info(`ESSConfig missing for company ${companyId}, auto-seeding defaults`);
    config = await platformPrisma.eSSConfig.create({ data: { companyId } });
  }

  await tryWriteCache(key, config, 'ess-config');
  return config;
}

/**
 * Get cached CompanySettings for a company.
 * Auto-seeds with Prisma defaults if no record exists.
 */
export async function getCachedCompanySettings(companyId: string): Promise<CompanySettings> {
  const key = companySettingsKey(companyId);

  const cached = await tryReadCache<CompanySettings>(key, 'company-settings');
  if (cached) return cached;

  let settings = await platformPrisma.companySettings.findUnique({ where: { companyId } });
  if (!settings) {
    logger.info(`CompanySettings missing for company ${companyId}, auto-seeding defaults`);
    settings = await platformPrisma.companySettings.create({ data: { companyId } });
  }

  await tryWriteCache(key, settings, 'company-settings');
  return settings;
}

/**
 * Get cached CompanyShift by shift ID.
 * Returns null if the shift does not exist (no auto-seed — shifts are not singletons).
 */
export async function getCachedShift(shiftId: string): Promise<CompanyShift | null> {
  const key = shiftKey(shiftId);

  const cached = await tryReadCache<CompanyShift>(key, 'shift');
  if (cached) return cached;

  const shift = await platformPrisma.companyShift.findUnique({ where: { id: shiftId } });
  if (!shift) return null;

  await tryWriteCache(key, shift, 'shift');
  return shift;
}

/**
 * Get cached Location by location ID.
 * Returns null if the location does not exist (no auto-seed — locations are not singletons).
 */
export async function getCachedLocation(locationId: string): Promise<Location | null> {
  const key = locationKey(locationId);

  const cached = await tryReadCache<Location>(key, 'location');
  if (cached) return cached;

  const location = await platformPrisma.location.findUnique({ where: { id: locationId } });
  if (!location) return null;

  await tryWriteCache(key, location, 'location');
  return location;
}

/**
 * Get cached ShiftBreaks for a shift.
 * Returns an empty array if no breaks exist for the shift.
 */
export async function getCachedShiftBreaks(shiftId: string): Promise<ShiftBreak[]> {
  const key = shiftBreaksKey(shiftId);

  const cached = await tryReadCache<ShiftBreak[]>(key, 'shift-breaks');
  if (cached) return cached;

  const breaks = await platformPrisma.shiftBreak.findMany({
    where: { shiftId },
    orderBy: { startTime: 'asc' },
  });

  await tryWriteCache(key, breaks, 'shift-breaks');
  return breaks;
}

// ─── Cache Invalidation Helpers ──────────────────────────────────────────────

/**
 * Invalidate cached SystemControls for a company.
 * Call this after any SystemControls update.
 */
export async function invalidateSystemControls(companyId: string): Promise<void> {
  await tryDeleteCache(systemControlsKey(companyId), 'system-controls');
}

/**
 * Invalidate cached AttendanceRule for a company.
 * Call this after any AttendanceRule update.
 */
export async function invalidateAttendanceRules(companyId: string): Promise<void> {
  await tryDeleteCache(attendanceRulesKey(companyId), 'attendance-rules');
}

/**
 * Invalidate cached OvertimeRule for a company.
 * Call this after any OvertimeRule update.
 */
export async function invalidateOvertimeRules(companyId: string): Promise<void> {
  await tryDeleteCache(overtimeRulesKey(companyId), 'overtime-rules');
}

/**
 * Invalidate cached ESSConfig for a company.
 * Call this after any ESSConfig update.
 */
export async function invalidateESSConfig(companyId: string): Promise<void> {
  await tryDeleteCache(essConfigKey(companyId), 'ess-config');
}

/**
 * Invalidate cached CompanySettings for a company.
 * Call this after any CompanySettings update.
 */
export async function invalidateCompanySettings(companyId: string): Promise<void> {
  await tryDeleteCache(companySettingsKey(companyId), 'company-settings');
}

/**
 * Invalidate cached CompanyShift.
 * Call this after any shift update.
 */
export async function invalidateShift(shiftId: string): Promise<void> {
  await tryDeleteCache(shiftKey(shiftId), 'shift');
}

/**
 * Invalidate cached Location.
 * Call this after any location update.
 */
export async function invalidateLocation(locationId: string): Promise<void> {
  await tryDeleteCache(locationKey(locationId), 'location');
}

/**
 * Invalidate cached ShiftBreaks for a shift.
 * Call this after any break create/update/delete.
 */
export async function invalidateShiftBreaks(shiftId: string): Promise<void> {
  await tryDeleteCache(shiftBreaksKey(shiftId), 'shift-breaks');
}

/**
 * Invalidate ALL config caches for a company.
 * Useful after bulk config operations (e.g., re-seeding).
 */
export async function invalidateAllCompanyConfigs(companyId: string): Promise<void> {
  await Promise.all([
    invalidateSystemControls(companyId),
    invalidateAttendanceRules(companyId),
    invalidateOvertimeRules(companyId),
    invalidateESSConfig(companyId),
    invalidateCompanySettings(companyId),
  ]);
}
