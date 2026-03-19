/**
 * Unit tests for BillingService
 *
 * Source file: src/core/billing/billing.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/logger    (suppress output)
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    invoice: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { BillingService } from '../billing.service';
import { platformPrisma } from '../../../config/database';

// Using `as any` avoids the circular Prisma type reference error that
// jest.Mocked<typeof platformPrisma.X> triggers in ts-jest.
const mockInvoice = platformPrisma.invoice as any;

// ── Shared fixture builders ───────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-uuid-1',
    amount: 10000,
    status: 'PAID',
    createdAt: new Date('2026-03-01'),
    paidAt: new Date('2026-03-05'),
    subscription: {
      id: 'sub-uuid-1',
      status: 'ACTIVE',
      tenant: {
        id: 'tenant-uuid-1',
        company: {
          id: 'company-uuid-1',
          name: 'Acme Corp',
          displayName: 'Acme Corp',
          companyCode: 'ACME',
        },
      },
    },
    ...overrides,
  };
}

// =============================================================================
// BillingService
// =============================================================================

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    service = new BillingService();
  });

  // ── getBillingSummary ───────────────────────────────────────────────────────

  describe('getBillingSummary', () => {
    function setupAggregateMocks({
      mrrAmount = null as number | null,
      overdueAmount = null as number | null,
      overdueCount = 0,
      pendingAmount = null as number | null,
      pendingCount = 0,
    } = {}) {
      // First aggregate call: MRR
      mockInvoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: mrrAmount } } as any)
        // Second: overdue
        .mockResolvedValueOnce({ _sum: { amount: overdueAmount }, _count: { id: overdueCount } } as any)
        // Third: pending
        .mockResolvedValueOnce({ _sum: { amount: pendingAmount }, _count: { id: pendingCount } } as any);
    }

    it('should return the correct shape with all zeros when there are no invoices', async () => {
      setupAggregateMocks();

      const result = await service.getBillingSummary();

      expect(result).toMatchObject({
        mrr: 0,
        arr: 0,
        overdue: { count: 0, amount: 0 },
        pending: { count: 0, amount: 0 },
      });
    });

    it('should calculate ARR as 12 × MRR', async () => {
      setupAggregateMocks({ mrrAmount: 50000 });

      const result = await service.getBillingSummary();

      expect(result.mrr).toBe(50000);
      expect(result.arr).toBe(600000); // 50000 * 12
    });

    it('should return 0 for MRR and ARR when the paid invoice sum is null', async () => {
      setupAggregateMocks({ mrrAmount: null });

      const result = await service.getBillingSummary();

      expect(result.mrr).toBe(0);
      expect(result.arr).toBe(0);
    });

    it('should return overdue count and amount from the overdue aggregate', async () => {
      setupAggregateMocks({
        overdueAmount: 75000,
        overdueCount: 3,
      });

      const result = await service.getBillingSummary();

      expect(result.overdue.count).toBe(3);
      expect(result.overdue.amount).toBe(75000);
    });

    it('should return 0 for overdue amount when the aggregate sum is null', async () => {
      setupAggregateMocks({ overdueAmount: null, overdueCount: 0 });

      const result = await service.getBillingSummary();

      expect(result.overdue.amount).toBe(0);
    });

    it('should return pending count and amount from the pending aggregate', async () => {
      setupAggregateMocks({
        pendingAmount: 30000,
        pendingCount: 5,
      });

      const result = await service.getBillingSummary();

      expect(result.pending.count).toBe(5);
      expect(result.pending.amount).toBe(30000);
    });

    it('should return 0 for pending amount when the aggregate sum is null', async () => {
      setupAggregateMocks({ pendingAmount: null, pendingCount: 0 });

      const result = await service.getBillingSummary();

      expect(result.pending.amount).toBe(0);
    });

    it('should query MRR only for paid invoices from the current month with active/trial subscriptions', async () => {
      setupAggregateMocks({ mrrAmount: 10000 });

      await service.getBillingSummary();

      const mrrCall = mockInvoice.aggregate.mock.calls[0][0];
      expect(mrrCall.where).toMatchObject({
        status: 'PAID',
        subscription: { status: { in: ['ACTIVE', 'TRIAL'] } },
      });
      // paidAt.gte should be set to start of the current month
      expect(mrrCall.where.paidAt.gte).toBeInstanceOf(Date);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      expect(mrrCall.where.paidAt.gte.getDate()).toBe(1);
    });

    it('should query overdue invoices with status OVERDUE', async () => {
      setupAggregateMocks();

      await service.getBillingSummary();

      const overdueCall = mockInvoice.aggregate.mock.calls[1][0];
      expect(overdueCall.where).toMatchObject({ status: 'OVERDUE' });
    });

    it('should query pending invoices with status PENDING', async () => {
      setupAggregateMocks();

      await service.getBillingSummary();

      const pendingCall = mockInvoice.aggregate.mock.calls[2][0];
      expect(pendingCall.where).toMatchObject({ status: 'PENDING' });
    });

    it('should return correct combined summary when all categories have data', async () => {
      setupAggregateMocks({
        mrrAmount: 100000,
        overdueAmount: 25000,
        overdueCount: 2,
        pendingAmount: 15000,
        pendingCount: 4,
      });

      const result = await service.getBillingSummary();

      expect(result).toMatchObject({
        mrr: 100000,
        arr: 1200000,
        overdue: { count: 2, amount: 25000 },
        pending: { count: 4, amount: 15000 },
      });
    });
  });

  // ── listInvoices ────────────────────────────────────────────────────────────

  describe('listInvoices', () => {
    it('should return invoices and a pagination object', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([makeInvoice()] as any);
      mockInvoice.count.mockResolvedValueOnce(1);

      const result = await service.listInvoices();

      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.invoices)).toBe(true);
    });

    it('should apply default page=1 and limit=25 when no options provided', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 })
      );
    });

    it('should compute the correct skip offset for page 2 with limit 10', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ page: 2, limit: 10 });

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }) // (2-1) * 10 = 10
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(73);

      const result = await service.listInvoices({ limit: 25 });

      // ceil(73 / 25) = 3
      expect(result.pagination.totalPages).toBe(3);
    });

    it('should filter by uppercased status when status option is provided', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ status: 'paid' }); // lowercase input

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      // Service uppercases the status before filtering
      expect(callArgs.where).toMatchObject({ status: 'PAID' });
    });

    it('should filter by OVERDUE status correctly', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ status: 'overdue' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where).toMatchObject({ status: 'OVERDUE' });
    });

    it('should NOT add status to where clause when status option is omitted', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('status');
    });

    it('should include nested subscription → tenant → company in each invoice', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.include).toMatchObject({
        subscription: {
          include: {
            tenant: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    companyCode: true,
                  },
                },
              },
            },
          },
        },
      });
    });

    it('should order invoices by createdAt descending', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    it('should return empty array and correct pagination when there are no invoices', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      const result = await service.listInvoices();

      expect(result.invoices).toEqual([]);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
      });
    });

    it('should return 1 totalPage when total equals limit exactly', async () => {
      mockInvoice.findMany.mockResolvedValueOnce(Array(10).fill(makeInvoice()) as any);
      mockInvoice.count.mockResolvedValueOnce(10);

      const result = await service.listInvoices({ limit: 10 });

      expect(result.pagination.totalPages).toBe(1);
    });
  });

  // ── getRevenueChart ─────────────────────────────────────────────────────────

  describe('getRevenueChart', () => {
    it('should return an array (not wrapped in an object)', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueChart();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return exactly 6 month entries even when there are no paid invoices', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueChart();

      expect(result).toHaveLength(6);
    });

    it('should initialise all 6 months with 0 revenue by default', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueChart();

      result.forEach(({ revenue }) => {
        expect(revenue).toBe(0);
      });
    });

    it('should return entries with "month" (YYYY-MM format) and "revenue" keys', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueChart();

      result.forEach((entry) => {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('revenue');
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
      });
    });

    it('should aggregate revenue for invoices in the current month', async () => {
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      mockInvoice.findMany.mockResolvedValueOnce([
        { amount: 20000, paidAt: new Date(now.getFullYear(), now.getMonth(), 10) },
        { amount: 30000, paidAt: new Date(now.getFullYear(), now.getMonth(), 20) },
      ] as any);

      const result = await service.getRevenueChart();

      const currentMonthEntry = result.find((e) => e.month === currentMonthKey);
      expect(currentMonthEntry).toBeDefined();
      expect(currentMonthEntry!.revenue).toBe(50000);
    });

    it('should query only paid invoices', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      await service.getRevenueChart();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PAID' }),
        })
      );
    });

    it('should only include invoices with paidAt >= 6 months ago', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      await service.getRevenueChart();

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt.gte).toBeInstanceOf(Date);

      // The cutoff date should be approximately 6 months ago, start of that month
      const cutoff = callArgs.where.paidAt.gte as Date;
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      // Cutoff should be within the same month as sixMonthsAgo
      expect(cutoff.getFullYear()).toBe(sixMonthsAgo.getFullYear());
      expect(cutoff.getMonth()).toBe(sixMonthsAgo.getMonth());
      expect(cutoff.getDate()).toBe(1); // First day of the month
    });

    it('should ignore invoices where paidAt is null', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([
        { amount: 9999, paidAt: null },
      ] as any);

      const result = await service.getRevenueChart();

      // All months should remain at 0
      result.forEach(({ revenue }) => {
        expect(revenue).toBe(0);
      });
    });

    it('should accumulate revenue across multiple invoices in the same month', async () => {
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      mockInvoice.findMany.mockResolvedValueOnce([
        { amount: 1000, paidAt: new Date(now.getFullYear(), now.getMonth(), 1) },
        { amount: 2000, paidAt: new Date(now.getFullYear(), now.getMonth(), 15) },
        { amount: 3000, paidAt: new Date(now.getFullYear(), now.getMonth(), 28) },
      ] as any);

      const result = await service.getRevenueChart();

      const entry = result.find((e) => e.month === currentMonthKey)!;
      expect(entry.revenue).toBe(6000);
    });

    it('should order returned months chronologically (oldest first)', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenueChart();

      // Months should be in ascending order (oldest first, newest last)
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1]!.month;
        const curr = result[i]!.month;
        expect(curr >= prev).toBe(true);
      }
    });
  });
});
