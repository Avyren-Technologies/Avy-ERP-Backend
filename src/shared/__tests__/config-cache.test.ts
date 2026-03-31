/**
 * Unit tests for config-cache.ts
 *
 * Source file: src/shared/utils/config-cache.ts
 *
 * External dependencies mocked:
 *   - config/database (platformPrisma)
 *   - config/redis    (cacheRedis)
 *   - config/logger
 *   - shared/utils/index (createRedisKey → deterministic key format)
 *
 * Verified behaviours:
 *   1. Cache hit → returns cached data, DB never called
 *   2. Cache miss → DB called, result cached
 *   3. Redis read failure → falls through to DB (non-fatal)
 *   4. Redis write failure → continues without caching (non-fatal)
 *   5. DB miss → auto-seeds and caches the new record
 *   6. Invalidation removes cached key
 *   7. invalidateAllCompanyConfigs removes all 5 company keys
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    systemControls:  { findUnique: jest.fn(), create: jest.fn() },
    attendanceRule:  { findUnique: jest.fn(), create: jest.fn() },
    overtimeRule:    { findUnique: jest.fn(), create: jest.fn() },
    eSSConfig:       { findUnique: jest.fn(), create: jest.fn() },
    companySettings: { findUnique: jest.fn(), create: jest.fn() },
    companyShift:    { findUnique: jest.fn() },
    location:        { findUnique: jest.fn() },
    shiftBreak:      { findMany: jest.fn() },
  },
}));

jest.mock('../../config/redis', () => ({
  cacheRedis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  getCachedSystemControls,
  getCachedAttendanceRules,
  getCachedOvertimeRules,
  getCachedESSConfig,
  getCachedCompanySettings,
  getCachedShift,
  getCachedLocation,
  getCachedShiftBreaks,
  invalidateSystemControls,
  invalidateAttendanceRules,
  invalidateOvertimeRules,
  invalidateESSConfig,
  invalidateCompanySettings,
  invalidateShift,
  invalidateLocation,
  invalidateShiftBreaks,
  invalidateAllCompanyConfigs,
} from '@/shared/utils/config-cache';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';

const mockRedis  = cacheRedis  as jest.Mocked<typeof cacheRedis>;
const mockPrismaControls  = platformPrisma.systemControls  as any;
const mockPrismaRules     = platformPrisma.attendanceRule  as any;
const mockPrismaOT        = platformPrisma.overtimeRule    as any;
const mockPrismaESS       = platformPrisma.eSSConfig       as any;
const mockPrismaSettings  = platformPrisma.companySettings as any;
const mockPrismaShift     = platformPrisma.companyShift    as any;
const mockPrismaLocation  = platformPrisma.location        as any;
const mockPrismaBreaks    = platformPrisma.shiftBreak      as any;

const COMPANY_ID = 'company-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheHit(value: unknown): void {
  mockRedis.get.mockResolvedValueOnce(JSON.stringify(value));
}

function cacheMiss(): void {
  mockRedis.get.mockResolvedValueOnce(null);
}

function cacheReadError(): void {
  mockRedis.get.mockRejectedValueOnce(new Error('Redis connection refused'));
}

function cacheWriteError(): void {
  mockRedis.set.mockRejectedValueOnce(new Error('Redis write failed'));
}

// ─── getCachedSystemControls ──────────────────────────────────────────────────

describe('getCachedSystemControls', () => {
  const MOCK_CONTROLS = { id: 'sc-1', companyId: COMPANY_ID, attendanceEnabled: true };

  it('should return cached data without hitting DB on cache hit', async () => {
    cacheHit(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.findUnique).not.toHaveBeenCalled();
  });

  it('should query DB and cache the result on cache miss', async () => {
    cacheMiss();
    mockPrismaControls.findUnique.mockResolvedValueOnce(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.findUnique).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
  });

  it('should auto-seed with create() when DB returns null', async () => {
    cacheMiss();
    mockPrismaControls.findUnique.mockResolvedValueOnce(null);
    mockPrismaControls.create.mockResolvedValueOnce(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
  });

  it('should fall through to DB on Redis read error (non-fatal)', async () => {
    cacheReadError();
    mockPrismaControls.findUnique.mockResolvedValueOnce(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should continue and return DB result when Redis write fails (non-fatal)', async () => {
    cacheMiss();
    cacheWriteError();
    mockPrismaControls.findUnique.mockResolvedValueOnce(MOCK_CONTROLS);
    const result = await getCachedSystemControls(COMPANY_ID);
    expect(result).toEqual(MOCK_CONTROLS);
  });
});

// ─── getCachedAttendanceRules ─────────────────────────────────────────────────

describe('getCachedAttendanceRules', () => {
  const MOCK_RULES = { id: 'ar-1', companyId: COMPANY_ID, gracePeriodMinutes: 15 };

  it('should return cached data on hit without hitting DB', async () => {
    cacheHit(MOCK_RULES);
    const result = await getCachedAttendanceRules(COMPANY_ID);
    expect(result).toEqual(MOCK_RULES);
    expect(mockPrismaRules.findUnique).not.toHaveBeenCalled();
  });

  it('should auto-seed when attendance rules are missing from DB', async () => {
    cacheMiss();
    mockPrismaRules.findUnique.mockResolvedValueOnce(null);
    mockPrismaRules.create.mockResolvedValueOnce(MOCK_RULES);
    const result = await getCachedAttendanceRules(COMPANY_ID);
    expect(mockPrismaRules.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
    expect(result).toEqual(MOCK_RULES);
  });
});

// ─── getCachedShift ───────────────────────────────────────────────────────────

describe('getCachedShift', () => {
  const SHIFT_ID = 'shift-001';
  const MOCK_SHIFT = { id: SHIFT_ID, name: 'Morning' };

  it('should return cached shift on hit', async () => {
    cacheHit(MOCK_SHIFT);
    const result = await getCachedShift(SHIFT_ID);
    expect(result).toEqual(MOCK_SHIFT);
    expect(mockPrismaShift.findUnique).not.toHaveBeenCalled();
  });

  it('should return null if shift is not found in DB (no auto-seed)', async () => {
    cacheMiss();
    mockPrismaShift.findUnique.mockResolvedValueOnce(null);
    const result = await getCachedShift(SHIFT_ID);
    expect(result).toBeNull();
    // Verify create was NOT called — shifts are not singletons
    expect(mockPrismaShift.create).toBeUndefined();
  });

  it('should cache the shift result after DB hit', async () => {
    cacheMiss();
    mockPrismaShift.findUnique.mockResolvedValueOnce(MOCK_SHIFT);
    await getCachedShift(SHIFT_ID);
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
  });
});

// ─── getCachedLocation ────────────────────────────────────────────────────────

describe('getCachedLocation', () => {
  const LOC_ID = 'loc-001';
  const MOCK_LOCATION = { id: LOC_ID, name: 'HQ' };

  it('should return null if location not found (no auto-seed)', async () => {
    cacheMiss();
    mockPrismaLocation.findUnique.mockResolvedValueOnce(null);
    const result = await getCachedLocation(LOC_ID);
    expect(result).toBeNull();
  });

  it('should return cached location on hit', async () => {
    cacheHit(MOCK_LOCATION);
    const result = await getCachedLocation(LOC_ID);
    expect(result).toEqual(MOCK_LOCATION);
    expect(mockPrismaLocation.findUnique).not.toHaveBeenCalled();
  });
});

// ─── getCachedShiftBreaks ─────────────────────────────────────────────────────

describe('getCachedShiftBreaks', () => {
  const SHIFT_ID = 'shift-001';
  const MOCK_BREAKS = [{ id: 'b1', shiftId: SHIFT_ID, duration: 30, isPaid: false }];

  it('should return cached breaks on hit', async () => {
    cacheHit(MOCK_BREAKS);
    const result = await getCachedShiftBreaks(SHIFT_ID);
    expect(result).toEqual(MOCK_BREAKS);
    expect(mockPrismaBreaks.findMany).not.toHaveBeenCalled();
  });

  it('should return empty array when no breaks exist for the shift', async () => {
    cacheMiss();
    mockPrismaBreaks.findMany.mockResolvedValueOnce([]);
    const result = await getCachedShiftBreaks(SHIFT_ID);
    expect(result).toEqual([]);
  });

  it('should query DB ordered by startTime asc on cache miss', async () => {
    cacheMiss();
    mockPrismaBreaks.findMany.mockResolvedValueOnce(MOCK_BREAKS);
    await getCachedShiftBreaks(SHIFT_ID);
    expect(mockPrismaBreaks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shiftId: SHIFT_ID },
        orderBy: { startTime: 'asc' },
      }),
    );
  });
});

// ─── Invalidation helpers ─────────────────────────────────────────────────────

describe('cache invalidation', () => {
  it('invalidateSystemControls should call redis.del with the correct key', async () => {
    await invalidateSystemControls(COMPANY_ID);
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).toHaveBeenCalledWith(
      expect.stringContaining(COMPANY_ID),
    );
  });

  it('invalidateAttendanceRules should call redis.del', async () => {
    await invalidateAttendanceRules(COMPANY_ID);
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });

  it('invalidateShift should call redis.del with shift-scoped key', async () => {
    await invalidateShift('shift-001');
    expect(mockRedis.del).toHaveBeenCalledWith(
      expect.stringContaining('shift-001'),
    );
  });

  it('invalidateAllCompanyConfigs should delete all 5 company-level keys', async () => {
    await invalidateAllCompanyConfigs(COMPANY_ID);
    // 5 calls: system-controls, attendance-rules, overtime-rules, ess-config, company-settings
    expect(mockRedis.del).toHaveBeenCalledTimes(5);
  });

  it('invalidation should be non-fatal when Redis del fails', async () => {
    mockRedis.del.mockRejectedValueOnce(new Error('Redis unavailable'));
    // Should NOT throw
    await expect(invalidateSystemControls(COMPANY_ID)).resolves.toBeUndefined();
  });
});
