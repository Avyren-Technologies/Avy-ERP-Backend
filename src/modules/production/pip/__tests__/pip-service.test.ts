/**
 * PIP Service — Integration Tests (mocked Prisma)
 */

import { Prisma } from '@prisma/client';
import { ApiError } from '../../../../shared/errors';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  pipIncentiveConfig: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  pipSlabConfig: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  pipDailyEntry: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  pipMonthlyReport: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  machine: { findUnique: jest.fn(), count: jest.fn() },
  part: { findUnique: jest.fn(), count: jest.fn() },
  employee: { findUnique: jest.fn() },
  companyShift: { findUnique: jest.fn() },
  payrollRun: { findUnique: jest.fn() },
  payrollEntry: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../../../../config/database', () => ({
  platformPrisma: mockPrisma,
}));

jest.mock('../../../../shared/utils/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../../../shared/utils/number-series', () => ({
  generateNextNumber: jest.fn().mockResolvedValue('AUTO-001'),
}));

jest.mock('../../../../shared/utils/config-cache', () => ({
  getCachedSystemControls: jest.fn().mockResolvedValue({ productionIncentivePlanEnabled: true }),
}));

jest.mock('../../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { pipService } from '../pip.service';
import { auditLog } from '../../../../shared/utils/audit';

// ── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'comp-001';
const USER_ID = 'user-001';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PipService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getIncentiveConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getIncentiveConfig', () => {
    it('returns existing config when found', async () => {
      const existingConfig = {
        id: 'cfg-1',
        companyId: COMPANY_ID,
        method1Enabled: true,
        method1Name: 'Method A',
        method2Enabled: false,
        method2Name: 'Method B',
      };
      mockPrisma.pipIncentiveConfig.findUnique.mockResolvedValue(existingConfig);

      const result = await pipService.getIncentiveConfig(COMPANY_ID);

      expect(result).toEqual(existingConfig);
      expect(mockPrisma.pipIncentiveConfig.create).not.toHaveBeenCalled();
    });

    it('auto-creates default config when not found', async () => {
      mockPrisma.pipIncentiveConfig.findUnique.mockResolvedValue(null);

      const defaultConfig = {
        id: 'cfg-new',
        companyId: COMPANY_ID,
        method1Enabled: false,
        method1Name: 'Excess Ratio Incentive',
        method2Enabled: false,
        method2Name: 'Milestone Rounding Incentive',
      };
      mockPrisma.pipIncentiveConfig.create.mockResolvedValue(defaultConfig);

      const result = await pipService.getIncentiveConfig(COMPANY_ID);

      expect(result).toEqual(defaultConfig);
      expect(mockPrisma.pipIncentiveConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          method1Enabled: false,
          method2Enabled: false,
        }),
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateIncentiveConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateIncentiveConfig', () => {
    const existingConfig = {
      id: 'cfg-1',
      companyId: COMPANY_ID,
      method1Enabled: false,
      method1Name: 'Method A',
      method2Enabled: false,
      method2Name: 'Method B',
    };

    beforeEach(() => {
      // getIncentiveConfig will hit findUnique first
      mockPrisma.pipIncentiveConfig.findUnique.mockResolvedValue(existingConfig);
    });

    it('enables method1 and auto-disables method2', async () => {
      const updated = { ...existingConfig, method1Enabled: true, method2Enabled: false };
      mockPrisma.pipIncentiveConfig.update.mockResolvedValue(updated);

      const result = await pipService.updateIncentiveConfig(
        COMPANY_ID,
        { method1Enabled: true },
        USER_ID,
      );

      expect(mockPrisma.pipIncentiveConfig.update).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID },
        data: expect.objectContaining({ method1Enabled: true, method2Enabled: false }),
      });
      expect(result).toEqual(updated);
      expect(auditLog).toHaveBeenCalled();
    });

    it('throws when both methods are enabled simultaneously', async () => {
      await expect(
        pipService.updateIncentiveConfig(
          COMPANY_ID,
          { method1Enabled: true, method2Enabled: true },
          USER_ID,
        ),
      ).rejects.toThrow(ApiError);
    });

    it('updates method name without changing enabled state', async () => {
      const updated = { ...existingConfig, method1Name: 'New Name' };
      mockPrisma.pipIncentiveConfig.update.mockResolvedValue(updated);

      const result = await pipService.updateIncentiveConfig(
        COMPANY_ID,
        { method1Name: 'New Name' },
        USER_ID,
      );

      expect(result.method1Name).toBe('New Name');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createSlabConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createSlabConfig', () => {
    const input = {
      machineId: 'mach-1',
      partId: 'part-1',
      shiftTargetQty: 100,
      slabTiers: [{ fromQty: 101, toQty: 150, ratePerPiece: 5 }],
    };

    it('creates successfully with valid data', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue(null); // no duplicate
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'mach-1', companyId: COMPANY_ID });
      mockPrisma.part.findUnique.mockResolvedValue({ id: 'part-1', companyId: COMPANY_ID });

      const created = { id: 'slab-1', companyId: COMPANY_ID, ...input };
      mockPrisma.pipSlabConfig.create.mockResolvedValue(created);

      const result = await pipService.createSlabConfig(COMPANY_ID, input, USER_ID);

      expect(result).toEqual(created);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'PipSlabConfig', action: 'CREATE' }),
      );
    });

    it('throws conflict when machine+part combo already exists', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        pipService.createSlabConfig(COMPANY_ID, input, USER_ID),
      ).rejects.toThrow(/already exists/);
    });

    it('throws not found when machine does not exist', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue(null);
      mockPrisma.machine.findUnique.mockResolvedValue(null);

      await expect(
        pipService.createSlabConfig(COMPANY_ID, input, USER_ID),
      ).rejects.toThrow(/Machine not found/);
    });

    it('throws not found when part does not exist', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue(null);
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'mach-1', companyId: COMPANY_ID });
      mockPrisma.part.findUnique.mockResolvedValue(null);

      await expect(
        pipService.createSlabConfig(COMPANY_ID, input, USER_ID),
      ).rejects.toThrow(/Part not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteSlabConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteSlabConfig', () => {
    it('deletes successfully when no daily entries reference it', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue({ id: 'slab-1', companyId: COMPANY_ID });
      mockPrisma.pipDailyEntry.count.mockResolvedValue(0);
      mockPrisma.pipSlabConfig.delete.mockResolvedValue({ id: 'slab-1' });

      const result = await pipService.deleteSlabConfig(COMPANY_ID, 'slab-1', USER_ID);

      expect(result).toEqual({ id: 'slab-1' });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE' }),
      );
    });

    it('throws when slab config is referenced by daily entries', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue({ id: 'slab-1', companyId: COMPANY_ID });
      mockPrisma.pipDailyEntry.count.mockResolvedValue(3);

      await expect(
        pipService.deleteSlabConfig(COMPANY_ID, 'slab-1', USER_ID),
      ).rejects.toThrow(/referenced by 3 daily entry/);
    });

    it('throws not found for invalid id', async () => {
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue(null);

      await expect(
        pipService.deleteSlabConfig(COMPANY_ID, 'bad-id', USER_ID),
      ).rejects.toThrow(/not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // saveDailyEntries
  // ═══════════════════════════════════════════════════════════════════════════

  describe('saveDailyEntries', () => {
    const baseInput = {
      operatorId: 'emp-1',
      shiftId: 'shift-1',
      entryDate: '2026-05-01',
      entries: [
        { machineId: 'mach-1', partId: 'part-1', qtyProduced: 120 },
      ],
    };

    beforeEach(() => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1', companyId: COMPANY_ID, firstName: 'John', lastName: 'Doe', employeeId: 'E001',
      });
      mockPrisma.companyShift.findUnique.mockResolvedValue({
        id: 'shift-1', companyId: COMPANY_ID, name: 'Day Shift',
      });
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([]); // no duplicates
      mockPrisma.pipIncentiveConfig.findUnique.mockResolvedValue({
        id: 'cfg-1', companyId: COMPANY_ID,
        method1Enabled: false, method1Name: 'M1',
        method2Enabled: false, method2Name: 'M2',
      });
    });

    it('saves entries successfully', async () => {
      // No slab config for this combo — falls back to machine + part lookup
      mockPrisma.pipSlabConfig.findUnique.mockResolvedValue(null);
      mockPrisma.machine.findUnique.mockResolvedValue({ machineCode: 'MC-1', assetName: 'Machine 1' });
      mockPrisma.part.findUnique.mockResolvedValue({ partNumber: 'P-001', name: 'Part One' });

      const createdEntry = { id: 'entry-1', qtyProduced: 120 };
      const txClient = {
        pipDailyEntry: { create: jest.fn().mockResolvedValue(createdEntry) },
      };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(txClient));

      const result = await pipService.saveDailyEntries(COMPANY_ID, baseInput, USER_ID);

      expect(result.sessionRef).toBeDefined();
      expect(result.entries).toHaveLength(1);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'PipDailyEntry', action: 'CREATE' }),
      );
    });

    it('throws conflict for duplicate operator+date+shift', async () => {
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([
        { id: 'existing-1', sessionRef: 'old-ref', machineId: 'mach-1', partId: 'part-1' },
      ]);

      await expect(
        pipService.saveDailyEntries(COMPANY_ID, baseInput, USER_ID),
      ).rejects.toThrow(/already has 1 entries/);
    });

    it('throws not found for invalid operator', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        pipService.saveDailyEntries(COMPANY_ID, baseInput, USER_ID),
      ).rejects.toThrow(/Operator.*not found/);
    });

    it('throws not found for invalid shift', async () => {
      mockPrisma.companyShift.findUnique.mockResolvedValue(null);

      await expect(
        pipService.saveDailyEntries(COMPANY_ID, baseInput, USER_ID),
      ).rejects.toThrow(/Shift not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateMonthlyReport
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateMonthlyReport', () => {
    it('aggregates daily entries and upserts report', async () => {
      const entries = [
        {
          operatorId: 'emp-1',
          operator: { id: 'emp-1', firstName: 'John', lastName: 'Doe', employeeId: 'E001' },
          partId: 'part-1',
          qtyProduced: 100,
          incentiveAmount: new Prisma.Decimal(500),
          entryDate: new Date('2026-05-01T00:00:00.000Z'),
        },
        {
          operatorId: 'emp-1',
          operator: { id: 'emp-1', firstName: 'John', lastName: 'Doe', employeeId: 'E001' },
          partId: 'part-1',
          qtyProduced: 120,
          incentiveAmount: new Prisma.Decimal(600),
          entryDate: new Date('2026-05-02T00:00:00.000Z'),
        },
      ];
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue(entries);

      const upsertedReport = { id: 'report-1', month: 5, year: 2026, totalIncentive: 1100 };
      mockPrisma.pipMonthlyReport.upsert.mockResolvedValue(upsertedReport);

      const result = await pipService.generateMonthlyReport(
        COMPANY_ID,
        { month: 5, year: 2026 },
        USER_ID,
      );

      expect(result).toEqual(upsertedReport);
      expect(mockPrisma.pipMonthlyReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId_locationId_month_year: expect.objectContaining({ month: 5, year: 2026 }),
          }),
        }),
      );
      expect(auditLog).toHaveBeenCalled();
    });

    it('throws when no entries exist for the month', async () => {
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([]);

      await expect(
        pipService.generateMonthlyReport(COMPANY_ID, { month: 5, year: 2026 }, USER_ID),
      ).rejects.toThrow(/No daily entries found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // mergeToPayroll
  // ═══════════════════════════════════════════════════════════════════════════

  describe('mergeToPayroll', () => {
    const reportId = 'report-1';
    const payrollRunId = 'pr-1';

    it('validates report is APPROVED', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: reportId, companyId: COMPANY_ID, status: 'DRAFT',
      });

      await expect(
        pipService.mergeToPayroll(COMPANY_ID, reportId, payrollRunId, USER_ID),
      ).rejects.toThrow(/Cannot merge report in DRAFT status/);
    });

    it('validates payroll run status', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: reportId, companyId: COMPANY_ID, status: 'APPROVED',
        operatorSummary: [], month: 5, year: 2026, locationId: null,
      });
      mockPrisma.payrollRun.findUnique.mockResolvedValue({
        id: payrollRunId, companyId: COMPANY_ID, status: 'DRAFT',
      });

      await expect(
        pipService.mergeToPayroll(COMPANY_ID, reportId, payrollRunId, USER_ID),
      ).rejects.toThrow(/Cannot merge into payroll run in DRAFT status/);
    });

    it('injects PIP_INCENTIVE into earnings and updates report', async () => {
      const report = {
        id: reportId,
        companyId: COMPANY_ID,
        status: 'APPROVED',
        month: 5,
        year: 2026,
        locationId: null,
        operatorSummary: [
          { operatorId: 'emp-1', operatorName: 'John Doe', totalIncentive: 500 },
        ],
      };
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue(report);
      mockPrisma.payrollRun.findUnique.mockResolvedValue({
        id: payrollRunId, companyId: COMPANY_ID, status: 'COMPUTED',
      });

      const payrollEntry = {
        id: 'pe-1',
        earnings: { BASIC: 10000 },
        grossEarnings: new Prisma.Decimal(10000),
        netPay: new Prisma.Decimal(8000),
      };

      const txClient = {
        payrollEntry: {
          findFirst: jest.fn().mockResolvedValue(payrollEntry),
          update: jest.fn().mockResolvedValue({}),
        },
        pipMonthlyReport: {
          update: jest.fn().mockResolvedValue({ ...report, status: 'MERGED' }),
        },
        pipDailyEntry: {
          updateMany: jest.fn().mockResolvedValue({ count: 5 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(txClient));

      const result = await pipService.mergeToPayroll(COMPANY_ID, reportId, payrollRunId, USER_ID);

      expect(txClient.payrollEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            earnings: expect.objectContaining({ PIP_INCENTIVE: 500 }),
          }),
        }),
      );
      expect(txClient.pipMonthlyReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'MERGED', payrollRunId }),
        }),
      );
    });

    it('throws not found for invalid report', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue(null);

      await expect(
        pipService.mergeToPayroll(COMPANY_ID, 'bad-id', payrollRunId, USER_ID),
      ).rejects.toThrow(/not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listSlabConfigs
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listSlabConfigs', () => {
    it('returns paginated results', async () => {
      const configs = [{ id: 'slab-1' }, { id: 'slab-2' }];
      mockPrisma.pipSlabConfig.findMany.mockResolvedValue(configs);
      mockPrisma.pipSlabConfig.count.mockResolvedValue(2);

      const result = await pipService.listSlabConfigs(COMPANY_ID, { page: 1, limit: 25 });

      expect(result.configs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteDailyEntries
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteDailyEntries', () => {
    it('deletes non-merged entries by session ref', async () => {
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([
        { id: 'e1', status: 'DRAFT', sessionRef: 'ref-1' },
        { id: 'e2', status: 'DRAFT', sessionRef: 'ref-1' },
      ]);
      mockPrisma.pipDailyEntry.deleteMany.mockResolvedValue({ count: 2 });

      const result = await pipService.deleteDailyEntries(COMPANY_ID, 'ref-1', USER_ID);

      expect(result.deletedCount).toBe(2);
    });

    it('throws when entries are merged', async () => {
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([
        { id: 'e1', status: 'MERGED', sessionRef: 'ref-1' },
      ]);

      await expect(
        pipService.deleteDailyEntries(COMPANY_ID, 'ref-1', USER_ID),
      ).rejects.toThrow(/Cannot delete entries that have been merged/);
    });

    it('throws not found when no entries match session ref', async () => {
      mockPrisma.pipDailyEntry.findMany.mockResolvedValue([]);

      await expect(
        pipService.deleteDailyEntries(COMPANY_ID, 'bad-ref', USER_ID),
      ).rejects.toThrow(/No entries found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // submitMonthlyReport / approveMonthlyReport / rejectMonthlyReport
  // ═══════════════════════════════════════════════════════════════════════════

  describe('submitMonthlyReport', () => {
    it('transitions DRAFT to SUBMITTED', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: 'r-1', companyId: COMPANY_ID, status: 'DRAFT',
      });
      mockPrisma.pipMonthlyReport.update.mockResolvedValue({
        id: 'r-1', status: 'SUBMITTED',
      });

      const result = await pipService.submitMonthlyReport(COMPANY_ID, 'r-1', USER_ID);
      expect(result.status).toBe('SUBMITTED');
    });

    it('rejects if status is not DRAFT or REJECTED', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: 'r-1', companyId: COMPANY_ID, status: 'APPROVED',
      });

      await expect(
        pipService.submitMonthlyReport(COMPANY_ID, 'r-1', USER_ID),
      ).rejects.toThrow(/Cannot submit report/);
    });
  });

  describe('approveMonthlyReport', () => {
    it('transitions SUBMITTED to APPROVED', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: 'r-1', companyId: COMPANY_ID, status: 'SUBMITTED',
      });
      mockPrisma.pipMonthlyReport.update.mockResolvedValue({
        id: 'r-1', status: 'APPROVED',
      });

      const result = await pipService.approveMonthlyReport(COMPANY_ID, 'r-1', USER_ID);
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('rejectMonthlyReport', () => {
    it('transitions SUBMITTED to REJECTED with reason', async () => {
      mockPrisma.pipMonthlyReport.findUnique.mockResolvedValue({
        id: 'r-1', companyId: COMPANY_ID, status: 'SUBMITTED',
      });
      mockPrisma.pipMonthlyReport.update.mockResolvedValue({
        id: 'r-1', status: 'REJECTED', rejectionReason: 'Bad data',
      });

      const result = await pipService.rejectMonthlyReport(COMPANY_ID, 'r-1', USER_ID, 'Bad data');
      expect(result.status).toBe('REJECTED');
    });
  });
});
