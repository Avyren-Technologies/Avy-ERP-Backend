/**
 * Unit tests for config-enforcement.middleware.ts
 *
 * Source file: src/shared/middleware/config-enforcement.middleware.ts
 *
 * External dependencies mocked:
 *   - config/database (platformPrisma — for payrollRun.findUnique)
 *   - @/shared/utils/config-cache (getCachedSystemControls, getCachedESSConfig)
 *   - config/logger
 *
 * Tests cover:
 *   - requireModuleEnabled() for each module key
 *   - requireESSFeature() for individual ESS feature flags
 *   - validatePayrollNotLocked() for locked/unlocked payroll periods
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    payrollRun: { findUnique: jest.fn() },
  },
}));

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedSystemControls: jest.fn(),
  getCachedESSConfig:      jest.fn(),
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';
import {
  requireModuleEnabled,
  requireESSFeature,
  validatePayrollNotLocked,
} from '@/shared/middleware/config-enforcement.middleware';
import { getCachedSystemControls, getCachedESSConfig } from '@/shared/utils/config-cache';
import { platformPrisma } from '../../config/database';

const mockGetControls = getCachedSystemControls as jest.Mock;
const mockGetESS      = getCachedESSConfig      as jest.Mock;
const mockPayrollRun  = platformPrisma.payrollRun as any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(companyId?: string): Request {
  return {
    user: companyId ? { companyId } : undefined,
    headers: {},
    cookies: {},
  } as unknown as Request;
}

function makeNext(): NextFunction {
  return jest.fn();
}

const mockRes = {} as Response;

function makeControls(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 'company-001',
    attendanceEnabled:  true,
    leaveEnabled:       true,
    payrollEnabled:     true,
    essEnabled:         true,
    performanceEnabled: true,
    recruitmentEnabled: true,
    trainingEnabled:    true,
    payrollLock:        true,
    ...overrides,
  };
}

function makeESSConfig(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 'company-001',
    leaveApplication:        true,
    viewPayslips:            true,
    attendanceRegularization: false,
    ...overrides,
  };
}

// ─── requireModuleEnabled ─────────────────────────────────────────────────────

describe('requireModuleEnabled', () => {
  it('should call next() when attendance module is enabled', async () => {
    mockGetControls.mockResolvedValue(makeControls({ attendanceEnabled: true }));
    const next = makeNext();
    const mw = requireModuleEnabled('attendance');
    await mw(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(); // called with no arguments = success
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next(ApiError.forbidden) when attendance module is disabled', async () => {
    mockGetControls.mockResolvedValue(makeControls({ attendanceEnabled: false }));
    const next = makeNext();
    const mw = requireModuleEnabled('attendance');
    await mw(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'MODULE_DISABLED' }),
    );
  });

  it('should call next(ApiError.forbidden) when leave module is disabled', async () => {
    mockGetControls.mockResolvedValue(makeControls({ leaveEnabled: false }));
    const next = makeNext();
    await requireModuleEnabled('leave')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'MODULE_DISABLED' }),
    );
  });

  it('should call next(ApiError.forbidden) when payroll module is disabled', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollEnabled: false }));
    const next = makeNext();
    await requireModuleEnabled('payroll')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('should call next(ApiError.forbidden) when performance module is disabled', async () => {
    mockGetControls.mockResolvedValue(makeControls({ performanceEnabled: false }));
    const next = makeNext();
    await requireModuleEnabled('performance')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('should call next(ApiError.forbidden) when no companyId is in req.user', async () => {
    const next = makeNext();
    await requireModuleEnabled('attendance')(makeRequest(undefined), mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    // getCachedSystemControls should NOT be called — fail fast on missing context
    expect(mockGetControls).not.toHaveBeenCalled();
  });

  it('should call next(error) when getCachedSystemControls throws', async () => {
    mockGetControls.mockRejectedValue(new Error('Redis unavailable'));
    const next = makeNext();
    await requireModuleEnabled('attendance')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── requireESSFeature ────────────────────────────────────────────────────────

describe('requireESSFeature', () => {
  it('should call next() when leaveApplication=true', async () => {
    mockGetESS.mockResolvedValue(makeESSConfig({ leaveApplication: true }));
    const next = makeNext();
    await requireESSFeature('leaveApplication')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next(ApiError.forbidden) when leaveApplication=false', async () => {
    mockGetESS.mockResolvedValue(makeESSConfig({ leaveApplication: false }));
    const next = makeNext();
    await requireESSFeature('leaveApplication')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'ESS_FEATURE_DISABLED' }),
    );
  });

  it('should call next() when feature is not present (undefined = not explicitly disabled)', async () => {
    // If the field is undefined (not false), the feature is NOT denied
    mockGetESS.mockResolvedValue(makeESSConfig({})); // attendanceRegularization is missing
    const next = makeNext();
    await requireESSFeature('nonExistentFeature')(makeRequest('company-001'), mockRes, next);
    // undefined !== false, so it should pass
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next(ApiError.forbidden) when attendanceRegularization=false', async () => {
    mockGetESS.mockResolvedValue(makeESSConfig({ attendanceRegularization: false }));
    const next = makeNext();
    await requireESSFeature('attendanceRegularization')(makeRequest('company-001'), mockRes, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('should call next(ApiError.forbidden) when no companyId in req.user', async () => {
    const next = makeNext();
    await requireESSFeature('viewPayslips')(makeRequest(undefined), mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

// ─── validatePayrollNotLocked ─────────────────────────────────────────────────

describe('validatePayrollNotLocked', () => {
  const DATE_MARCH_30 = new Date('2026-03-30');

  it('should resolve without throwing when payroll run is not locked (PROCESSING status)', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue({
      status: 'PROCESSING',
      month: 3,
      year: 2026,
    });
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).resolves.toBeUndefined();
  });

  it('should throw ApiError.forbidden when payroll run is APPROVED', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue({
      status: 'APPROVED',
      month: 3,
      year: 2026,
    });
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PAYROLL_LOCKED',
    });
  });

  it('should throw ApiError.forbidden when payroll run is DISBURSED', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue({
      status: 'DISBURSED',
      month: 3,
      year: 2026,
    });
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('should throw ApiError.forbidden when payroll run is ARCHIVED', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue({
      status: 'ARCHIVED',
      month: 3,
      year: 2026,
    });
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('should resolve without throwing when no payroll run exists for the month', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue(null);
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).resolves.toBeUndefined();
  });

  it('should resolve without throwing when payrollLock feature is disabled', async () => {
    // payrollLock = false → no enforcement needed regardless of run status
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: false }));
    await expect(validatePayrollNotLocked('company-001', DATE_MARCH_30)).resolves.toBeUndefined();
    // DB should never be queried when the feature is disabled
    expect(mockPayrollRun.findUnique).not.toHaveBeenCalled();
  });

  it('should derive month and year from the provided date correctly', async () => {
    mockGetControls.mockResolvedValue(makeControls({ payrollLock: true }));
    mockPayrollRun.findUnique.mockResolvedValue(null);
    await validatePayrollNotLocked('company-001', new Date('2026-12-15'));
    expect(mockPayrollRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId_month_year: {
            companyId: 'company-001',
            month: 12,
            year: 2026,
          },
        },
      }),
    );
  });
});
