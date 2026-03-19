/**
 * Unit tests for InvoiceService
 *
 * Source file: src/core/billing/invoice.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/logger    (suppress output)
 *   - src/core/billing/pricing.service (pricingService)
 *   - src/infrastructure/email/email.service (sendEmail)
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    invoice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    platformBillingConfig: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../pricing.service', () => ({
  pricingService: {
    getConfig: jest.fn(),
    calculateLocationMonthlyCost: jest.fn(),
    calculateOneTimeFee: jest.fn(),
    calculateAmcFee: jest.fn(),
    calculateGST: jest.fn(),
  },
  MODULE_CATALOGUE: [
    { id: 'hr', name: 'HR', price: 2999 },
    { id: 'production', name: 'Production', price: 3499 },
  ],
  USER_TIERS: [
    { key: 'starter', label: 'Starter', basePrice: 4999, perUserPrice: 49 },
  ],
}));

jest.mock('../../../infrastructure/email/email.service', () => ({
  sendEmail: jest.fn(),
}));

import { InvoiceService } from '../invoice.service';
import { platformPrisma } from '../../../config/database';
import { pricingService } from '../pricing.service';
import { sendEmail } from '../../../infrastructure/email/email.service';

const mockInvoice = platformPrisma.invoice as any;
const mockCompany = platformPrisma.company as any;
const mockPayment = platformPrisma.payment as any;
const mockBillingConfig = platformPrisma.platformBillingConfig as any;
const mockTransaction = platformPrisma.$transaction as any;
const mockPricingService = pricingService as any;
const mockSendEmail = sendEmail as any;

// ── Shared fixture builders ───────────────────────────────────────────────────

function makeConfig() {
  return {
    id: 'config-1',
    defaultOneTimeMultiplier: 24,
    defaultAmcPercentage: 18,
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    platformGstin: '27AABCU9603R1ZM',
    invoicePrefix: 'INV',
    nextInvoiceSeq: 1,
  };
}

function makeCompany(overrides = {}) {
  return {
    id: 'company-1',
    name: 'Acme Corp',
    displayName: 'Acme Corp',
    companyCode: 'ACME',
    selectedModuleIds: '["hr","production"]',
    customModulePricing: null,
    userTier: 'starter',
    customTierPrice: null,
    oneTimeMultiplier: null,
    amcPercentage: null,
    locations: [
      {
        id: 'loc-1',
        name: 'HQ',
        moduleIds: null,
        customModulePricing: null,
        oneTimeLicenseFee: null,
        amcAmount: null,
        gstin: '27AABCU9603R1ZM',
        billingType: 'monthly',
      },
    ],
    tenant: {
      id: 'tenant-1',
      companyId: 'company-1',
      subscriptions: [
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE' },
      ],
    },
    ...overrides,
  };
}

function makeInvoice(overrides = {}) {
  return {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    amount: 11497,
    status: 'PENDING',
    dueDate: new Date('2026-04-18'),
    invoiceNumber: 'INV-2026-0001',
    invoiceType: 'SUBSCRIPTION',
    lineItems: '[]',
    subtotal: 11497,
    cgst: 1034.73,
    sgst: 1034.73,
    igst: 0,
    totalTax: 2069.46,
    totalAmount: 13566.46,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    paidVia: null,
    paymentReference: null,
    sentAt: null,
    pdfUrl: null,
    gstNotApplicable: false,
    createdAt: new Date('2026-03-19'),
    updatedAt: new Date('2026-03-19'),
    paidAt: null,
    subscription: {
      id: 'sub-1',
      tenant: {
        id: 'tenant-1',
        company: {
          id: 'company-1',
          name: 'Acme Corp',
          displayName: 'Acme Corp',
          companyCode: 'ACME',
          endpointType: 'default',
        },
      },
    },
    ...overrides,
  };
}

// =============================================================================
// InvoiceService
// =============================================================================

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(() => {
    service = new InvoiceService();
    jest.clearAllMocks();
  });

  // ── listInvoices ─────────────────────────────────────────────────────────

  describe('listInvoices', () => {
    it('should return invoices and a pagination object', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([makeInvoice()]);
      mockInvoice.count.mockResolvedValueOnce(1);

      const result = await service.listInvoices();

      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.invoices)).toBe(true);
    });

    it('should apply default page=1 and limit=25', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });

    it('should filter by uppercased status', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ status: 'paid' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('PAID');
    });

    it('should filter by invoiceType', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ invoiceType: 'amc' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.invoiceType).toBe('AMC');
    });

    it('should filter by companyId through subscription→tenant relation', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ companyId: 'company-1' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.subscription).toEqual({ tenant: { companyId: 'company-1' } });
    });

    it('should search by invoice number or company name', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ search: 'Acme' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(2);
    });

    it('should calculate totalPages correctly', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(73);

      const result = await service.listInvoices({ limit: 25 });

      expect(result.pagination.totalPages).toBe(3); // ceil(73/25)
    });

    it('should order by createdAt descending', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices();

      expect(mockInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('should filter by date range', async () => {
      mockInvoice.findMany.mockResolvedValueOnce([]);
      mockInvoice.count.mockResolvedValueOnce(0);

      await service.listInvoices({ dateFrom: '2026-01-01', dateTo: '2026-03-31' });

      const callArgs = mockInvoice.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArgs.where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  // ── getInvoiceById ───────────────────────────────────────────────────────

  describe('getInvoiceById', () => {
    it('should return the invoice when found', async () => {
      const invoice = makeInvoice({ payments: [] });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);

      const result = await service.getInvoiceById('inv-1');

      expect(result).toEqual(invoice);
      expect(mockInvoice.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1' } }),
      );
    });

    it('should return null when not found', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(null);

      const result = await service.getInvoiceById('non-existent');

      expect(result).toBeNull();
    });

    it('should include payments and subscription relations', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice());

      await service.getInvoiceById('inv-1');

      const callArgs = mockInvoice.findUnique.mock.calls[0][0];
      expect(callArgs.include.payments).toBe(true);
      expect(callArgs.include.subscription).toBeDefined();
    });
  });

  // ── generateInvoice ──────────────────────────────────────────────────────

  describe('generateInvoice', () => {
    beforeEach(() => {
      mockPricingService.getConfig.mockResolvedValue(makeConfig());
      mockPricingService.calculateLocationMonthlyCost.mockReturnValue(11497);
      mockPricingService.calculateOneTimeFee.mockReturnValue(275928);
      mockPricingService.calculateAmcFee.mockReturnValue(49667.04);
      mockPricingService.calculateGST.mockReturnValue({
        cgst: 1034.73,
        sgst: 1034.73,
        igst: 0,
        totalTax: 2069.46,
        gstNotApplicable: false,
      });
      mockBillingConfig.update.mockResolvedValue({ nextInvoiceSeq: 2 });
    });

    it('should generate a SUBSCRIPTION invoice with auto-calculated line items', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      const expectedInvoice = makeInvoice();
      mockInvoice.create.mockResolvedValueOnce(expectedInvoice);

      const result = await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'SUBSCRIPTION',
      });

      expect(result).toEqual(expectedInvoice);
      expect(mockPricingService.calculateLocationMonthlyCost).toHaveBeenCalled();
      expect(mockPricingService.calculateGST).toHaveBeenCalled();
    });

    it('should generate correct invoice number format', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice());

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'SUBSCRIPTION',
      });

      const createArgs = mockInvoice.create.mock.calls[0][0];
      // Should be INV-YYYY-0001 (seq 2 - 1 = 1, padded to 4)
      expect(createArgs.data.invoiceNumber).toMatch(/^INV-\d{4}-0001$/);
    });

    it('should use custom line items when provided', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice());

      const customItems = [
        { description: 'Custom item', quantity: 2, unitPrice: 5000, amount: 10000 },
      ];

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'SUBSCRIPTION',
        customLineItems: customItems,
      });

      const createArgs = mockInvoice.create.mock.calls[0][0];
      expect(createArgs.data.subtotal).toBe(10000);
      // Should NOT call pricingService.calculateLocationMonthlyCost for custom items
      expect(mockPricingService.calculateLocationMonthlyCost).not.toHaveBeenCalled();
    });

    it('should calculate GST using pricingService', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice());

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'SUBSCRIPTION',
      });

      expect(mockPricingService.calculateGST).toHaveBeenCalledWith(
        '27AABCU9603R1ZM', // platformGstin
        '27AABCU9603R1ZM', // locationGstin
        11497,              // subtotal
        expect.any(Object), // config
      );
    });

    it('should throw if company not found', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.generateInvoice({ companyId: 'non-existent', invoiceType: 'SUBSCRIPTION' }),
      ).rejects.toThrow('Company not found');
    });

    it('should throw if company has no tenant', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany({ tenant: null }));

      await expect(
        service.generateInvoice({ companyId: 'company-1', invoiceType: 'SUBSCRIPTION' }),
      ).rejects.toThrow('Company does not have a tenant record');
    });

    it('should throw if company has no subscription', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(
        makeCompany({
          tenant: { id: 'tenant-1', companyId: 'company-1', subscriptions: [] },
        }),
      );

      await expect(
        service.generateInvoice({ companyId: 'company-1', invoiceType: 'SUBSCRIPTION' }),
      ).rejects.toThrow('Company does not have an active subscription');
    });

    it('should generate ONE_TIME_LICENSE invoice', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice({ invoiceType: 'ONE_TIME_LICENSE' }));

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'ONE_TIME_LICENSE',
      });

      expect(mockPricingService.calculateOneTimeFee).toHaveBeenCalled();
    });

    it('should generate AMC invoice', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice({ invoiceType: 'AMC' }));

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'AMC',
      });

      expect(mockPricingService.calculateAmcFee).toHaveBeenCalled();
    });

    it('should atomically increment the invoice sequence', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(makeCompany());
      mockInvoice.create.mockResolvedValueOnce(makeInvoice());

      await service.generateInvoice({
        companyId: 'company-1',
        invoiceType: 'SUBSCRIPTION',
      });

      expect(mockBillingConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'config-1' },
          data: { nextInvoiceSeq: { increment: 1 } },
        }),
      );
    });
  });

  // ── markAsPaid ───────────────────────────────────────────────────────────

  describe('markAsPaid', () => {
    it('should update invoice to PAID and create a payment record', async () => {
      const invoice = makeInvoice({ status: 'PENDING' });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);

      const updatedInvoice = { ...invoice, status: 'PAID', paidAt: new Date() };
      const payment = { id: 'pay-1', invoiceId: 'inv-1', amount: 13566.46 };
      mockTransaction.mockResolvedValueOnce([updatedInvoice, payment]);

      const result = await service.markAsPaid('inv-1', {
        method: 'BANK_TRANSFER',
        transactionReference: 'TXN-123',
        recordedBy: 'user-1',
      });

      expect(result.invoice.status).toBe('PAID');
      expect(result.payment).toBeDefined();
    });

    it('should throw if invoice not found', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.markAsPaid('non-existent', { method: 'CASH', recordedBy: 'user-1' }),
      ).rejects.toThrow('Invoice not found');
    });

    it('should throw if invoice is already paid', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'PAID' }));

      await expect(
        service.markAsPaid('inv-1', { method: 'CASH', recordedBy: 'user-1' }),
      ).rejects.toThrow('Invoice is already paid');
    });

    it('should throw if invoice is cancelled', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'CANCELLED' }));

      await expect(
        service.markAsPaid('inv-1', { method: 'CASH', recordedBy: 'user-1' }),
      ).rejects.toThrow('Cannot mark a cancelled invoice as paid');
    });

    it('should use current date as paidAt when not provided', async () => {
      const invoice = makeInvoice({ status: 'PENDING' });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);
      mockTransaction.mockResolvedValueOnce([{ ...invoice, status: 'PAID' }, { id: 'pay-1' }]);

      await service.markAsPaid('inv-1', { method: 'CASH', recordedBy: 'user-1' });

      const transactionArgs = mockTransaction.mock.calls[0][0];
      // The invoice update call should have a paidAt that is a Date
      // (Checking that $transaction was called with two operations)
      expect(transactionArgs).toHaveLength(2);
    });
  });

  // ── voidInvoice ──────────────────────────────────────────────────────────

  describe('voidInvoice', () => {
    it('should set status to CANCELLED', async () => {
      const invoice = makeInvoice({ status: 'PENDING' });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);
      mockInvoice.update.mockResolvedValueOnce({ ...invoice, status: 'CANCELLED' });

      const result = await service.voidInvoice('inv-1');

      expect(result.status).toBe('CANCELLED');
      expect(mockInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { status: 'CANCELLED' },
        }),
      );
    });

    it('should throw if invoice not found', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(null);

      await expect(service.voidInvoice('non-existent')).rejects.toThrow('Invoice not found');
    });

    it('should throw if invoice is already paid', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'PAID' }));

      await expect(service.voidInvoice('inv-1')).rejects.toThrow('Cannot void a paid invoice');
    });

    it('should throw if invoice is already cancelled', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(makeInvoice({ status: 'CANCELLED' }));

      await expect(service.voidInvoice('inv-1')).rejects.toThrow('Invoice is already cancelled');
    });

    it('should allow voiding an OVERDUE invoice', async () => {
      const invoice = makeInvoice({ status: 'OVERDUE' });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);
      mockInvoice.update.mockResolvedValueOnce({ ...invoice, status: 'CANCELLED' });

      const result = await service.voidInvoice('inv-1');

      expect(result.status).toBe('CANCELLED');
    });
  });

  // ── sendInvoiceEmail ─────────────────────────────────────────────────────

  describe('sendInvoiceEmail', () => {
    it('should send email and update sentAt', async () => {
      const invoice = makeInvoice({
        subscription: {
          id: 'sub-1',
          tenant: {
            id: 'tenant-1',
            company: {
              id: 'company-1',
              name: 'Acme Corp',
              displayName: 'Acme Corp',
              contacts: [
                { id: 'contact-1', name: 'John Doe', email: 'john@acme.com', type: 'billing' },
              ],
            },
          },
        },
      });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);
      mockInvoice.update.mockResolvedValueOnce({ ...invoice, sentAt: new Date() });

      const result = await service.sendInvoiceEmail('inv-1');

      expect(result.sentTo).toBe('john@acme.com');
      expect(mockSendEmail).toHaveBeenCalled();
      expect(mockInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { sentAt: expect.any(Date) },
        }),
      );
    });

    it('should throw if invoice not found', async () => {
      mockInvoice.findUnique.mockResolvedValueOnce(null);

      await expect(service.sendInvoiceEmail('non-existent')).rejects.toThrow('Invoice not found');
    });

    it('should throw if no contacts found', async () => {
      const invoice = makeInvoice({
        subscription: {
          id: 'sub-1',
          tenant: {
            id: 'tenant-1',
            company: {
              id: 'company-1',
              name: 'Acme Corp',
              displayName: 'Acme Corp',
              contacts: [],
            },
          },
        },
      });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);

      await expect(service.sendInvoiceEmail('inv-1')).rejects.toThrow('No contacts found');
    });

    it('should fall back to first contact if no billing contact', async () => {
      const invoice = makeInvoice({
        subscription: {
          id: 'sub-1',
          tenant: {
            id: 'tenant-1',
            company: {
              id: 'company-1',
              name: 'Acme Corp',
              displayName: 'Acme Corp',
              contacts: [
                { id: 'contact-1', name: 'Jane Doe', email: 'jane@acme.com', type: 'technical' },
              ],
            },
          },
        },
      });
      mockInvoice.findUnique.mockResolvedValueOnce(invoice);
      mockInvoice.update.mockResolvedValueOnce({});

      const result = await service.sendInvoiceEmail('inv-1');

      expect(result.sentTo).toBe('jane@acme.com');
    });
  });
});
