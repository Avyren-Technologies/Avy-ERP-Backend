import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors';
import { HttpStatus } from '../../shared/types';

export class PaymentService {
  // ────────────────────────────────────────────────────────────────────
  // List payments with pagination and filters
  // ────────────────────────────────────────────────────────────────────
  async listPayments(options: {
    page?: number;
    limit?: number;
    companyId?: string;
    invoiceId?: string;
    method?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const { page = 1, limit = 25, companyId, invoiceId, method, dateFrom, dateTo } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (method) {
      where.method = method.toUpperCase();
    }

    if (dateFrom || dateTo) {
      where.paidAt = {};
      if (dateFrom) {
        where.paidAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.paidAt.lte = new Date(dateTo);
      }
    }

    if (companyId) {
      where.invoice = {
        subscription: {
          tenant: {
            companyId,
          },
        },
      };
    }

    const [payments, total] = await Promise.all([
      platformPrisma.payment.findMany({
        where,
        include: {
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
        },
        skip: offset,
        take: limit,
        orderBy: { paidAt: 'desc' },
      }),
      platformPrisma.payment.count({ where }),
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get single payment by ID
  // ────────────────────────────────────────────────────────────────────
  async getPaymentById(id: string) {
    const payment = await platformPrisma.payment.findUnique({
      where: { id },
      include: {
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
      },
    });

    return payment;
  }

  // ────────────────────────────────────────────────────────────────────
  // Record a payment against an invoice
  // ────────────────────────────────────────────────────────────────────
  async recordPayment(data: {
    invoiceId: string;
    amount: number;
    method: string;
    transactionReference?: string;
    paidAt: Date;
    notes?: string;
    recordedBy: string;
  }) {
    // 1. Verify invoice exists and is not CANCELLED
    const invoice = await platformPrisma.invoice.findUnique({
      where: { id: data.invoiceId },
    });

    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }

    if (invoice.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot record payment for a cancelled invoice');
    }

    // 2. Create payment record
    const payment = await platformPrisma.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method as any,
        transactionReference: data.transactionReference ?? null,
        paidAt: data.paidAt,
        notes: data.notes ?? null,
        recordedBy: data.recordedBy,
      },
      include: {
        invoice: true,
      },
    });

    // 3. Check if sum of all payments >= invoice totalAmount
    const paymentSum = await platformPrisma.payment.aggregate({
      _sum: { amount: true },
      where: { invoiceId: data.invoiceId },
    });

    const totalPaid = paymentSum._sum.amount ?? 0;

    if (totalPaid >= invoice.totalAmount) {
      await platformPrisma.invoice.update({
        where: { id: data.invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      logger.info(`Invoice ${data.invoiceId} marked as PAID (total paid: ${totalPaid})`);
    }

    // 4. Return created payment
    return payment;
  }
}

export const paymentService = new PaymentService();
