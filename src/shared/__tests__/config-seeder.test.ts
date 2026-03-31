/**
 * Unit tests for config-seeder.service.ts
 *
 * Source file: src/shared/services/config-seeder.service.ts
 *
 * External dependencies mocked:
 *   - config/database (platformPrisma)
 *   - config/logger
 *
 * getIndustryDefaults is NOT mocked — we test it end-to-end with the seeder
 * to verify correct industry templates are applied.
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    companySettings: { upsert: jest.fn() },
    systemControls:  { upsert: jest.fn() },
    attendanceRule:  { upsert: jest.fn() },
    overtimeRule:    { upsert: jest.fn() },
    eSSConfig:       { upsert: jest.fn() },
    $transaction:    jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { seedCompanyConfigs } from '@/shared/services/config-seeder.service';
import { platformPrisma } from '../../config/database';

const mockTransaction = platformPrisma.$transaction as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the data passed to a specific upsert call by model name.
 * platformPrisma.$transaction receives an array of pending queries —
 * but because Prisma upserts are called directly inside $transaction as an array,
 * we inspect the call arguments to $transaction.
 *
 * Since each upsert is a jest.fn() that just records its args, we check them directly.
 */
function getUpsertArgs(mockFn: jest.Mock) {
  return mockFn.mock.calls[0]?.[0] as {
    where: Record<string, string>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // $transaction executes all upserts — simulate by calling each upsert in the array
  mockTransaction.mockImplementation(async (ops: Array<Promise<unknown>>) => {
    return Promise.all(ops);
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('seedCompanyConfigs', () => {
  describe('upsert invocation', () => {
    it('should call $transaction once with all 5 upsert operations', async () => {
      await seedCompanyConfigs('company-001');
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      const transactionArg = mockTransaction.mock.calls[0]?.[0];
      expect(Array.isArray(transactionArg)).toBe(true);
      expect(transactionArg).toHaveLength(5);
    });

    it('should upsert CompanySettings with the company ID', async () => {
      await seedCompanyConfigs('company-001');
      const args = getUpsertArgs(platformPrisma.companySettings.upsert as jest.Mock);
      expect(args.where).toEqual({ companyId: 'company-001' });
      expect(args.create.companyId).toBe('company-001');
      expect(args.update).toEqual({});
    });

    it('should upsert SystemControls with the company ID', async () => {
      await seedCompanyConfigs('company-001');
      const args = getUpsertArgs(platformPrisma.systemControls.upsert as jest.Mock);
      expect(args.where).toEqual({ companyId: 'company-001' });
      expect(args.create.companyId).toBe('company-001');
      expect(args.update).toEqual({});
    });

    it('should upsert AttendanceRule with the company ID', async () => {
      await seedCompanyConfigs('company-001');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.where).toEqual({ companyId: 'company-001' });
      expect(args.create.companyId).toBe('company-001');
    });

    it('should upsert OvertimeRule with the company ID', async () => {
      await seedCompanyConfigs('company-001');
      const args = getUpsertArgs(platformPrisma.overtimeRule.upsert as jest.Mock);
      expect(args.where).toEqual({ companyId: 'company-001' });
      expect(args.create.companyId).toBe('company-001');
    });

    it('should upsert ESSConfig with the company ID', async () => {
      await seedCompanyConfigs('company-001');
      const args = getUpsertArgs(platformPrisma.eSSConfig.upsert as jest.Mock);
      expect(args.where).toEqual({ companyId: 'company-001' });
      expect(args.create.companyId).toBe('company-001');
    });
  });

  describe('idempotency — update is always empty', () => {
    it('should always use update:{} so repeated calls are no-ops', async () => {
      await seedCompanyConfigs('company-001');
      await seedCompanyConfigs('company-001');

      // Both calls should have update: {} on every upsert
      const models = [
        platformPrisma.companySettings.upsert,
        platformPrisma.systemControls.upsert,
        platformPrisma.attendanceRule.upsert,
        platformPrisma.overtimeRule.upsert,
        platformPrisma.eSSConfig.upsert,
      ] as jest.Mock[];

      for (const mock of models) {
        for (const call of mock.mock.calls) {
          expect(call[0].update).toEqual({});
        }
      }
    });
  });

  describe('industry-specific defaults', () => {
    it('should apply IT template: gracePeriod=30, gpsRequired=false', async () => {
      await seedCompanyConfigs('company-it', 'IT');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.create.gracePeriodMinutes).toBe(30);
      expect(args.create.gpsRequired).toBe(false);
    });

    it('should apply MANUFACTURING template: gpsRequired=true, lateDeductionType=HALF_DAY_AFTER_LIMIT', async () => {
      await seedCompanyConfigs('company-mfg', 'MANUFACTURING');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.create.gpsRequired).toBe(true);
      expect(args.create.lateDeductionType).toBe('HALF_DAY_AFTER_LIMIT');
    });

    it('should apply RETAIL template: punchMode=SHIFT_BASED, selfieRequired=true', async () => {
      await seedCompanyConfigs('company-retail', 'RETAIL');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.create.punchMode).toBe('SHIFT_BASED');
      expect(args.create.selfieRequired).toBe(true);
    });

    it('should apply HEALTHCARE template: mfaRequired=true, SHIFT_BASED punchMode', async () => {
      await seedCompanyConfigs('company-health', 'HEALTHCARE');
      const rulesArgs = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(rulesArgs.create.punchMode).toBe('SHIFT_BASED');

      const controlsArgs = getUpsertArgs(platformPrisma.systemControls.upsert as jest.Mock);
      expect(controlsArgs.create.mfaRequired).toBe(true);
    });

    it('should fall back to default template when industryType is undefined', async () => {
      await seedCompanyConfigs('company-default');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.create.gracePeriodMinutes).toBe(15);
      expect(args.create.punchMode).toBe('FIRST_LAST');
    });

    it('should fall back to default template for unknown industry type', async () => {
      await seedCompanyConfigs('company-agri', 'Agriculture');
      const args = getUpsertArgs(platformPrisma.attendanceRule.upsert as jest.Mock);
      expect(args.create.gracePeriodMinutes).toBe(15);
    });
  });

  describe('error handling', () => {
    it('should propagate DB errors from $transaction', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('DB connection lost'));
      await expect(seedCompanyConfigs('company-fail')).rejects.toThrow('DB connection lost');
    });
  });
});
