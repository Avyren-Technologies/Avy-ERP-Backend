import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

export class BillingService {
  // ────────────────────────────────────────────────────────────────────
  // Revenue summary KPIs
  // ────────────────────────────────────────────────────────────────────
  async getBillingSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      mrrData,
      overdueData,
      pendingData,
      oneTimeData,
    ] = await Promise.all([
      // MRR: sum of paid invoices this month from active subscriptions
      platformPrisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth },
          subscription: { status: { in: ['ACTIVE', 'TRIAL'] } },
        },
      }),

      // Overdue invoices
      platformPrisma.invoice.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: {
          status: 'OVERDUE',
        },
      }),

      // Pending invoices
      platformPrisma.invoice.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: {
          status: 'PENDING',
        },
      }),

      // One-time revenue: sum of totalAmount from paid one-time license invoices
      platformPrisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'PAID',
          invoiceType: 'ONE_TIME_LICENSE',
        },
      }),
    ]);

    const mrr = mrrData._sum.amount ?? 0;
    const arr = mrr * 12;

    return {
      mrr,
      arr,
      overdue: {
        count: overdueData._count.id,
        amount: overdueData._sum.amount ?? 0,
      },
      pending: {
        count: pendingData._count.id,
        amount: pendingData._sum.amount ?? 0,
      },
      oneTimeRevenue: oneTimeData._sum.totalAmount ?? 0,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // List invoices with pagination
  // ────────────────────────────────────────────────────────────────────
  async listInvoices(options: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }

    const [invoices, total] = await Promise.all([
      platformPrisma.invoice.findMany({
        where,
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
                      endpointType: true,
                    },
                  },
                },
              },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Monthly revenue chart data (last 6 months)
  // ────────────────────────────────────────────────────────────────────
  async getRevenueChart() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const invoices = await platformPrisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: sixMonthsAgo },
      },
      select: {
        amount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    // Pre-fill last 6 months with 0
    const monthMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, 0);
    }

    invoices.forEach((inv) => {
      if (inv.paidAt) {
        const key = `${inv.paidAt.getFullYear()}-${String(inv.paidAt.getMonth() + 1).padStart(2, '0')}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + inv.amount);
      }
    });

    return Array.from(monthMap.entries()).map(([month, revenue]) => ({
      month,
      revenue,
    }));
  }
}

export const billingService = new BillingService();
