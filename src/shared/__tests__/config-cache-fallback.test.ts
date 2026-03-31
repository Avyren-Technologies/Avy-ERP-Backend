/**
 * Infrastructure fallback tests for config-cache helpers
 *
 * Tests the real getCachedSystemControls and getCachedAttendanceRules
 * implementations under adverse infrastructure conditions:
 *   - Redis completely unavailable → non-fatal, falls through to DB
 *   - DB miss → auto-seeds singleton defaults via create()
 *
 * IMPORTANT: This file does NOT mock the config-cache module, so the
 * real getCached* implementations run against mocked Redis and Prisma.
 * This is why these tests live in a separate file from failure-scenarios.test.ts,
 * which mocks config-cache entirely for resolvePolicy edge-case tests.
 *
 * Mock path note: test file is at src/shared/__tests__/, so relative
 * paths to config/ are ../../config/<module>.
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    systemControls: { findUnique: jest.fn(), create: jest.fn() },
    attendanceRule: { findUnique: jest.fn(), create: jest.fn() },
    overtimeRule:   { findUnique: jest.fn(), create: jest.fn() },
    eSSConfig:      { findUnique: jest.fn(), create: jest.fn() },
    companySettings:{ findUnique: jest.fn(), create: jest.fn() },
    companyShift:   { findUnique: jest.fn() },
    location:       { findUnique: jest.fn() },
    shiftBreak:     { findMany: jest.fn() },
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

// Note: config-cache is NOT mocked here — we test the real implementations.

import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';

const mockRedis          = cacheRedis as jest.Mocked<typeof cacheRedis>;
const mockPrismaControls = platformPrisma.systemControls as any;
const mockPrismaRules    = platformPrisma.attendanceRule as any;

const COMPANY_ID = 'company-001';

// ─── 1. Redis unavailable → DB fallback ──────────────────────────────────────

describe('Redis completely unavailable', () => {
  beforeEach(() => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));
  });

  it('getCachedSystemControls should fall through to DB when Redis is unavailable', async () => {
    const MOCK_CONTROLS = { id: 'sc-1', companyId: COMPANY_ID, attendanceEnabled: true };
    mockPrismaControls.findUnique.mockResolvedValue(MOCK_CONTROLS);

    // Import the real function — no module-level mock for config-cache in this file
    const { getCachedSystemControls } = await import('@/shared/utils/config-cache');
    const result = await getCachedSystemControls(COMPANY_ID);

    expect(result).toEqual(MOCK_CONTROLS);
    expect(mockPrismaControls.findUnique).toHaveBeenCalled();
  });

  it('getCachedAttendanceRules should fall through to DB when Redis is unavailable', async () => {
    const MOCK_RULES = { id: 'ar-1', companyId: COMPANY_ID, gracePeriodMinutes: 15 };
    mockPrismaRules.findUnique.mockResolvedValue(MOCK_RULES);

    const { getCachedAttendanceRules } = await import('@/shared/utils/config-cache');
    const result = await getCachedAttendanceRules(COMPANY_ID);

    expect(result).toEqual(MOCK_RULES);
    expect(mockPrismaRules.findUnique).toHaveBeenCalled();
  });
});

// ─── 2. DB auto-seed on missing config ───────────────────────────────────────

describe('Config auto-seeding on DB miss', () => {
  beforeEach(() => {
    mockRedis.get.mockResolvedValue(null); // Always cache miss
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused')); // write fails (non-fatal)
  });

  it('should auto-seed SystemControls when findUnique returns null', async () => {
    const SEEDED = { id: 'sc-new', companyId: COMPANY_ID, attendanceEnabled: true };
    mockPrismaControls.findUnique.mockResolvedValue(null);
    mockPrismaControls.create.mockResolvedValue(SEEDED);

    const { getCachedSystemControls } = await import('@/shared/utils/config-cache');
    const result = await getCachedSystemControls(COMPANY_ID);

    expect(result).toEqual(SEEDED);
    expect(mockPrismaControls.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
  });

  it('should auto-seed AttendanceRule when findUnique returns null', async () => {
    const SEEDED = { id: 'ar-new', companyId: COMPANY_ID, gracePeriodMinutes: 15 };
    mockPrismaRules.findUnique.mockResolvedValue(null);
    mockPrismaRules.create.mockResolvedValue(SEEDED);

    const { getCachedAttendanceRules } = await import('@/shared/utils/config-cache');
    const result = await getCachedAttendanceRules(COMPANY_ID);

    expect(result).toEqual(SEEDED);
    expect(mockPrismaRules.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_ID } });
  });
});
