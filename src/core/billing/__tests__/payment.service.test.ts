/**
 * Unit tests for PaymentService
 *
 * Source file: src/core/billing/payment.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/logger    (suppress output)
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    invoice: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PaymentService } from '../payment.service';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

const mockPayment = platformPrisma.payment as any;
const mockInvoice = platformPrisma.invoice as any;

// ── Shared fixture builders ───────────────────────────────────────────────────

function makePayment(overrides: Record<string, any> = {}) {
  return {
    id: 'pay-uuid-1',
    invoiceId: 'inv-uuid-1',
    amount: 5000,
    method: 'BANK_TRANSFER',
    transactionReference: 'TXN-001',
    paidAt: new Date('2026-03-10'),
    recordedBy: 'user-uuid-1',
    notes: null,
    createdAt: new Date('2026-03-10'),
    invoice: {
      id: 'inv-uuid-1',
      totalAmount: 10000,
      status: 'PENDING',
      subscription: {
        id: 'sub-uuid-1',
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
    },
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-uuid-1',
    totalAmount: 10000,
    amount: 10000,
    status: 'PENDING',
    ...overrides,
  };
}

// =============================================================================
// PaymentService
// =============================================================================

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
    jest.clearAllMocks();
  });

  // ── listPayments ────────────────────────────────────────────────────────────

  describe('listPayments', () => {
    it('should return payments and a pagination object', async () => {
      mockPayment.findMany.mockResolvedValueOnce([makePayment()]);
      mockPayment.count.mockResolvedValueOnce(1);

      const result = await service.listPayments();

      expect(result).toHaveProperty('payments');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.payments)).toBe(true);
    });

    it('should apply default page=1 and limit=25 when no options provided', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments();

      expect(mockPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 })
      );
    });

    it('should compute the correct skip offset for page 2 with limit 10', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({ page: 2, limit: 10 });

      expect(mockPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(73);

      const result = await service.listPayments({ limit: 25 });

      expect(result.pagination.totalPages).toBe(3); // ceil(73/25) = 3
    });

    it('should filter by companyId via nested invoice relation', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({ companyId: 'company-uuid-1' });

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.invoice).toMatchObject({
        subscription: {
          tenant: {
            companyId: 'company-uuid-1',
          },
        },
      });
    });

    it('should filter by invoiceId when provided', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({ invoiceId: 'inv-uuid-1' });

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.invoiceId).toBe('inv-uuid-1');
    });

    it('should filter by uppercased method when provided', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({ method: 'upi' });

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.method).toBe('UPI');
    });

    it('should filter by date range when dateFrom and dateTo provided', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
      });

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt.gte).toEqual(new Date('2026-01-01'));
      expect(callArgs.where.paidAt.lte).toEqual(new Date('2026-03-31'));
    });

    it('should filter by dateFrom only when dateTo is omitted', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments({ dateFrom: '2026-01-01' });

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt.gte).toEqual(new Date('2026-01-01'));
      expect(callArgs.where.paidAt).not.toHaveProperty('lte');
    });

    it('should order payments by paidAt descending', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments();

      expect(mockPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { paidAt: 'desc' } })
      );
    });

    it('should include nested invoice → subscription → tenant → company relations', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      await service.listPayments();

      const callArgs = mockPayment.findMany.mock.calls[0][0];
      expect(callArgs.include).toMatchObject({
        invoice: {
          include: {
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
          },
        },
      });
    });

    it('should return empty array and correct pagination when there are no payments', async () => {
      mockPayment.findMany.mockResolvedValueOnce([]);
      mockPayment.count.mockResolvedValueOnce(0);

      const result = await service.listPayments();

      expect(result.payments).toEqual([]);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
      });
    });
  });

  // ── getPaymentById ──────────────────────────────────────────────────────────

  describe('getPaymentById', () => {
    it('should return the payment when found', async () => {
      const payment = makePayment();
      mockPayment.findUnique.mockResolvedValueOnce(payment);

      const result = await service.getPaymentById('pay-uuid-1');

      expect(result).toEqual(payment);
      expect(mockPayment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-uuid-1' } })
      );
    });

    it('should return null when payment is not found', async () => {
      mockPayment.findUnique.mockResolvedValueOnce(null);

      const result = await service.getPaymentById('non-existent');

      expect(result).toBeNull();
    });

    it('should include invoice relations in the result', async () => {
      mockPayment.findUnique.mockResolvedValueOnce(makePayment());

      await service.getPaymentById('pay-uuid-1');

      const callArgs = mockPayment.findUnique.mock.calls[0][0];
      expect(callArgs.include).toHaveProperty('invoice');
      expect(callArgs.include.invoice.include).toHaveProperty('subscription');
    });
  });

  // ── recordPayment ───────────────────────────────────────────────────────────

  describe('recordPayment', () => {
    const validPaymentData = {
      invoiceId: 'inv-uuid-1',
      amount: 5000,
      method: 'BANK_TRANSFER',
      transactionReference: 'TXN-001',
      paidAt: new Date('2026-03-10'),
      notes: 'Partial payment',
      recordedBy: 'user-uuid-1',
    };

    it('should create a payment record when invoice exists and is not cancelled', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice());
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } });

      const result = await service.recordPayment(validPaymentData);

      expect(result).toBeDefined();
      expect(result.id).toBe('pay-uuid-1');
      expect(mockPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'inv-uuid-1',
            amount: 5000,
            method: 'BANK_TRANSFER',
          }),
        })
      );
    });

    it('should throw NotFound error when invoice does not exist', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(null);

      await expect(service.recordPayment(validPaymentData))
        .rejects
        .toThrow('Invoice not found');
    });

    it('should throw BadRequest error when invoice is CANCELLED', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'CANCELLED' }));

      await expect(service.recordPayment(validPaymentData))
        .rejects
        .toThrow('Cannot record payment for a cancelled invoice');
    });

    it('should NOT mark invoice as PAID when total paid is less than totalAmount', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ totalAmount: 10000 }));
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } });

      await service.recordPayment(validPaymentData);

      expect(mockInvoice.update).not.toHaveBeenCalled();
    });

    it('should mark invoice as PAID when total paid equals totalAmount', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ totalAmount: 10000 }));
      mockPayment.create.mockResolvedValueOnce(makePayment({ amount: 10000 }));
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });

      await service.recordPayment({ ...validPaymentData, amount: 10000 });

      expect(mockInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-uuid-1' },
          data: expect.objectContaining({
            status: 'PAID',
            paidAt: expect.any(Date),
          }),
        })
      );
    });

    it('should mark invoice as PAID when total paid exceeds totalAmount (overpayment)', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ totalAmount: 10000 }));
      mockPayment.create.mockResolvedValueOnce(makePayment({ amount: 12000 }));
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 12000 } });

      await service.recordPayment({ ...validPaymentData, amount: 12000 });

      expect(mockInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-uuid-1' },
          data: expect.objectContaining({ status: 'PAID' }),
        })
      );
    });

    it('should aggregate all payments for the invoice to determine paid status', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ totalAmount: 10000 }));
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 7000 } });

      await service.recordPayment(validPaymentData);

      expect(mockPayment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          _sum: { amount: true },
          where: { invoiceId: 'inv-uuid-1' },
        })
      );
    });

    it('should allow payment for PENDING invoices', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'PENDING' }));
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } });

      const result = await service.recordPayment(validPaymentData);

      expect(result).toBeDefined();
    });

    it('should allow payment for OVERDUE invoices', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'OVERDUE' }));
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } });

      const result = await service.recordPayment(validPaymentData);

      expect(result).toBeDefined();
    });

    it('should store transactionReference and notes when provided', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice());
      mockPayment.create.mockResolvedValueOnce(makePayment());
      mockPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } });

      await service.recordPayment(validPaymentData);

      expect(mockPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transactionReference: 'TXN-001',
            notes: 'Partial payment',
          }),
        })
      );
    });
  });
});
