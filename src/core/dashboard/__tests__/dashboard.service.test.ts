/**
 * Unit tests for DashboardService
 *
 * Source file: src/core/dashboard/dashboard.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/logger    (suppress output)
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    company: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    invoice: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    location: {
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { DashboardService } from '../dashboard.service';
import { platformPrisma } from '../../../config/database';

// Using `as any` avoids the circular Prisma type reference error that
// jest.Mocked<typeof platformPrisma.X> triggers in ts-jest.
const mockCompany = platformPrisma.company as any;
const mockUser = platformPrisma.user as any;
const mockInvoice = platformPrisma.invoice as any;
const mockAuditLog = platformPrisma.auditLog as any;
const mockLocation = platformPrisma.location as any;

// =============================================================================
// DashboardService
// =============================================================================

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
  });

  // ── getSuperAdminStats ──────────────────────────────────────────────────────

  describe('getSuperAdminStats', () => {
    function setupDefaultMocks({
      companiesByStatus = [],
      totalUsers = 0,
      mrrAmount = null as number | null,
      activeModuleCompanies = [] as Array<{ selectedModuleIds: any }>,
    } = {}) {
      mockCompany.groupBy.mockResolvedValueOnce(companiesByStatus as any);
      mockUser.count.mockResolvedValueOnce(totalUsers);
      mockInvoice.aggregate.mockResolvedValueOnce({ _sum: { amount: mrrAmount } } as any);
      mockCompany.findMany.mockResolvedValueOnce(activeModuleCompanies as any);
    }

    it('should return the correct shape with all zero values when there is no data', async () => {
      setupDefaultMocks();

      const result = await service.getSuperAdminStats();

      expect(result).toMatchObject({
        activeCompanies: 0,
        totalUsers: 0,
        monthlyRevenue: 0,
        activeModules: 0,
        tenantOverview: {
          active: 0,
          trial: 0,
          suspended: 0,
          expired: 0,
        },
      });
    });

    it('should count active companies from "Active" wizardStatus group', async () => {
      setupDefaultMocks({
        companiesByStatus: [
          { wizardStatus: 'Active', _count: { wizardStatus: 5 } },
          { wizardStatus: 'Pilot', _count: { wizardStatus: 3 } },
          { wizardStatus: 'Draft', _count: { wizardStatus: 2 } },
          { wizardStatus: 'Inactive', _count: { wizardStatus: 1 } },
        ],
        totalUsers: 120,
        mrrAmount: 50000,
        activeModuleCompanies: [
          { selectedModuleIds: ['hr', 'payroll', 'attendance'] },
          { selectedModuleIds: ['hr', 'inventory'] },
        ],
      });

      const result = await service.getSuperAdminStats();

      expect(result.activeCompanies).toBe(5);
      expect(result.tenantOverview.active).toBe(5);
    });

    it('should sum Pilot and Draft counts into the trial bucket', async () => {
      setupDefaultMocks({
        companiesByStatus: [
          { wizardStatus: 'Pilot', _count: { wizardStatus: 4 } },
          { wizardStatus: 'Draft', _count: { wizardStatus: 7 } },
        ],
      });

      const result = await service.getSuperAdminStats();

      expect(result.tenantOverview.trial).toBe(11); // 4 + 7
      expect(result.tenantOverview.active).toBe(0);
    });

    it('should count Inactive companies as suspended', async () => {
      setupDefaultMocks({
        companiesByStatus: [
          { wizardStatus: 'Inactive', _count: { wizardStatus: 6 } },
        ],
      });

      const result = await service.getSuperAdminStats();

      expect(result.tenantOverview.suspended).toBe(6);
    });

    it('should return the MRR amount from aggregated paid invoices', async () => {
      setupDefaultMocks({ mrrAmount: 125000 });

      const result = await service.getSuperAdminStats();

      expect(result.monthlyRevenue).toBe(125000);
    });

    it('should return 0 for monthlyRevenue when the aggregate sum is null (no invoices)', async () => {
      setupDefaultMocks({ mrrAmount: null });

      const result = await service.getSuperAdminStats();

      expect(result.monthlyRevenue).toBe(0);
    });

    it('should count unique module IDs across all active companies', async () => {
      setupDefaultMocks({
        activeModuleCompanies: [
          { selectedModuleIds: ['hr', 'payroll', 'attendance'] },
          { selectedModuleIds: ['hr', 'inventory'] }, // 'hr' is shared — should not double-count
          { selectedModuleIds: null }, // null selectedModuleIds should be ignored
        ],
      });

      const result = await service.getSuperAdminStats();

      // Unique modules: hr, payroll, attendance, inventory = 4
      expect(result.activeModules).toBe(4);
    });

    it('should return correct totalUsers from user count', async () => {
      setupDefaultMocks({ totalUsers: 350 });

      const result = await service.getSuperAdminStats();

      expect(result.totalUsers).toBe(350);
    });

    it('should handle a company with non-array selectedModuleIds gracefully', async () => {
      setupDefaultMocks({
        activeModuleCompanies: [
          { selectedModuleIds: 'not-an-array' as any }, // malformed — skip
          { selectedModuleIds: ['hr'] },
        ],
      });

      const result = await service.getSuperAdminStats();

      // Only 'hr' from the valid entry
      expect(result.activeModules).toBe(1);
    });
  });

  // ── getRecentActivity ───────────────────────────────────────────────────────

  describe('getRecentActivity', () => {
    const sampleActivities = [
      {
        id: 'log-1',
        timestamp: new Date('2026-03-19T10:00:00Z'),
        userId: 'user-1',
        action: 'CREATE_COMPANY',
        resourceId: 'company-1',
        details: {},
      },
      {
        id: 'log-2',
        timestamp: new Date('2026-03-19T09:00:00Z'),
        userId: 'user-2',
        action: 'UPDATE_COMPANY',
        resourceId: 'company-2',
        details: {},
      },
    ];

    it('should return an array of audit log entries', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce(sampleActivities as any);

      const result = await service.getRecentActivity();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should return entries ordered by timestamp descending (most recent first)', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce(sampleActivities as any);

      await service.getRecentActivity();

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('should use the default limit of 10 when no argument is provided', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce([]);

      await service.getRecentActivity();

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should use the provided limit value', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce([]);

      await service.getRecentActivity(5);

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });

    it('should return an empty array when there are no audit log entries', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce([]);

      const result = await service.getRecentActivity();

      expect(result).toEqual([]);
    });

    it('should return entries with expected fields', async () => {
      mockAuditLog.findMany.mockResolvedValueOnce([sampleActivities[0]] as any);

      const result = await service.getRecentActivity(1);

      expect(result[0]).toMatchObject({
        id: 'log-1',
        action: 'CREATE_COMPANY',
        userId: 'user-1',
      });
    });
  });

  // ── getRevenueMetrics ───────────────────────────────────────────────────────

  describe('getRevenueMetrics', () => {
    it('should return an object with a "months" array', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueMetrics();

      expect(result).toHaveProperty('months');
      expect(Array.isArray(result.months)).toBe(true);
    });

    it('should pre-fill exactly 6 month entries even when there are no invoices', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueMetrics();

      expect(result.months).toHaveLength(6);
    });

    it('should initialize all months with 0 revenue when there are no paid invoices', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueMetrics();

      result.months.forEach(({ revenue }) => {
        expect(revenue).toBe(0);
      });
    });

    it('should aggregate revenue correctly for a specific month', async () => {
      // Return two invoices both paid in the current month
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      mockInvoice.findMany.mockResolvedValueOnce([
        { amount: 10000, paidAt: new Date(now.getFullYear(), now.getMonth(), 5) },
        { amount: 5000, paidAt: new Date(now.getFullYear(), now.getMonth(), 15) },
      ] as any);

      const result = await service.getRevenueMetrics();

      const currentMonthEntry = result.months.find((m) => m.month === currentMonthKey);
      expect(currentMonthEntry).toBeDefined();
      expect(currentMonthEntry!.revenue).toBe(15000);
    });

    it('should return each month entry with "month" and "revenue" keys', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueMetrics();

      result.months.forEach((entry) => {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('revenue');
        // Month key format is YYYY-MM
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
      });
    });

    it('should query only paid invoices from the last 6 months', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      await service.getRevenueMetrics();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PAID' }),
        })
      );
    });

    it('should skip invoice entries where paidAt is null', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([
        { amount: 9999, paidAt: null }, // should be ignored
      ] as any);

      const result = await service.getRevenueMetrics();

      // All months should still be 0 since the invoice has no paidAt
      result.months.forEach(({ revenue }) => {
        expect(revenue).toBe(0);
      });
    });
  });

  // ── getCompanyAdminStats ────────────────────────────────────────────────────

  describe('getCompanyAdminStats', () => {
    const COMPANY_ID = 'company-uuid-1';

    it('should return the correct shape with company data', async () => {
      mockUser.count.mockResolvedValueOnce(25);
      mockLocation.count.mockResolvedValueOnce(3);
      mockCompany.findUnique.mockResolvedValueOnce({
        selectedModuleIds: ['hr', 'payroll', 'attendance'],
        wizardStatus: 'Active',
        displayName: 'Acme Corp',
      } as any);

      const result = await service.getCompanyAdminStats(COMPANY_ID);

      expect(result).toMatchObject({
        companyName: 'Acme Corp',
        wizardStatus: 'Active',
        totalUsers: 25,
        totalLocations: 3,
        activeModules: 3,
        moduleIds: ['hr', 'payroll', 'attendance'],
      });
    });

    it('should return empty moduleIds array when selectedModuleIds is null', async () => {
      mockUser.count.mockResolvedValueOnce(0);
      mockLocation.count.mockResolvedValueOnce(0);
      mockCompany.findUnique.mockResolvedValueOnce({
        selectedModuleIds: null,
        wizardStatus: 'Draft',
        displayName: 'New Co',
      } as any);

      const result = await service.getCompanyAdminStats(COMPANY_ID);

      expect(result.moduleIds).toEqual([]);
      expect(result.activeModules).toBe(0);
    });

    it('should default companyName to empty string when company is not found', async () => {
      mockUser.count.mockResolvedValueOnce(0);
      mockLocation.count.mockResolvedValueOnce(0);
      mockCompany.findUnique.mockResolvedValueOnce(null);

      const result = await service.getCompanyAdminStats(COMPANY_ID);

      expect(result.companyName).toBe('');
      expect(result.wizardStatus).toBe('Draft');
    });

    it('should count users scoped to the given companyId', async () => {
      mockUser.count.mockResolvedValueOnce(10);
      mockLocation.count.mockResolvedValueOnce(2);
      mockCompany.findUnique.mockResolvedValueOnce({
        selectedModuleIds: [],
        wizardStatus: 'Pilot',
        displayName: 'Test Co',
      } as any);

      await service.getCompanyAdminStats(COMPANY_ID);

      expect(mockUser.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } })
      );
      expect(mockLocation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } })
      );
    });
  });
});
