import type { SeederModule } from './types';
import { log, vlog } from './types';
import { randomInt } from './utils';

const MODULE = 'billing';

export const seeder: SeederModule = {
  name: 'Billing',
  order: 23,
  seed: async (ctx) => {
    const { prisma, tenantId, companyId } = ctx;

    // Check existing subscription
    const existingSub = await prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (existingSub) {
      log(MODULE, `Skipping — subscription already exists for tenant`);
      return;
    }

    const now = new Date();

    // ── Create Subscription ──
    const subscription = await prisma.subscription.create({
      data: {
        tenantId,
        planId: 'starter-monthly',
        userTier: 'STARTER',
        billingType: 'MONTHLY',
        modules: JSON.stringify([
          { code: 'HRMS', name: 'Human Resource Management', price: 4999 },
          { code: 'PAYROLL', name: 'Payroll Management', price: 2999 },
        ]),
        status: 'ACTIVE',
        startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      },
    });
    vlog(ctx, MODULE, `Created subscription: ${subscription.id}`);

    // ── Create 3 Invoices (past 3 months) + Payments ──
    let invoiceCount = 0;
    let paymentCount = 0;

    for (let i = 3; i >= 1; i--) {
      const billingStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const billingEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const dueDate = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const paidAt = new Date(
        dueDate.getFullYear(),
        dueDate.getMonth(),
        randomInt(10, 14),
      );

      const subtotal = 7998; // 4999 + 2999
      const cgst = Math.round(subtotal * 0.09 * 100) / 100;
      const sgst = Math.round(subtotal * 0.09 * 100) / 100;
      const totalTax = cgst + sgst;
      const totalAmount = subtotal + totalTax;

      const invoiceNumber = `INV-${billingStart.getFullYear()}${String(billingStart.getMonth() + 1).padStart(2, '0')}-${String(4 - i).padStart(4, '0')}`;

      const invoice = await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          invoiceNumber,
          invoiceType: 'SUBSCRIPTION',
          amount: totalAmount,
          subtotal,
          cgst,
          sgst,
          igst: 0,
          totalTax,
          totalAmount,
          lineItems: JSON.stringify([
            { description: 'HRMS Module — Monthly', quantity: 1, unitPrice: 4999, amount: 4999 },
            { description: 'Payroll Module — Monthly', quantity: 1, unitPrice: 2999, amount: 2999 },
          ]),
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd,
          dueDate,
          paidAt,
          paidVia: 'BANK_TRANSFER',
          status: 'PAID',
          sentAt: new Date(billingStart.getFullYear(), billingStart.getMonth(), 1),
        },
      });
      invoiceCount++;

      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: totalAmount,
          method: 'BANK_TRANSFER',
          transactionReference: `TXN${billingStart.getFullYear()}${String(billingStart.getMonth() + 1).padStart(2, '0')}${randomInt(100000, 999999)}`,
          paidAt,
          recordedBy: 'system-seed',
          notes: 'Auto-recorded payment for monthly subscription',
        },
      });
      paymentCount++;

      vlog(ctx, MODULE, `Invoice ${invoiceNumber}: ₹${totalAmount.toFixed(2)} (PAID)`);
    }

    log(MODULE, `Created 1 subscription, ${invoiceCount} invoices, ${paymentCount} payments`);
  },
};
