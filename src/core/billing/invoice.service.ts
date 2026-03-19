import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors';
import { HttpStatus } from '../../shared/types';
import { roundToDecimal } from '../../shared/utils';
import { pricingService, MODULE_CATALOGUE } from './pricing.service';
import { sendEmail } from '../../infrastructure/email/email.service';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface ListInvoicesFilters {
  page?: number;
  limit?: number;
  status?: string;
  invoiceType?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface GenerateInvoiceParams {
  companyId: string;
  locationId?: string | undefined;
  invoiceType: 'SUBSCRIPTION' | 'ONE_TIME_LICENSE' | 'AMC' | 'PRORATED_ADJUSTMENT';
  billingPeriodStart?: Date | undefined;
  billingPeriodEnd?: Date | undefined;
  customLineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> | undefined;
  notes?: string | undefined;
}

export interface MarkAsPaidData {
  method: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'RAZORPAY' | 'UPI' | 'OTHER';
  transactionReference?: string | undefined;
  paidAt?: Date | undefined;
  recordedBy: string;
  notes?: string | undefined;
}

// ────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────

export class InvoiceService {
  // ──────────────────────────────────────────────────────────────────
  // 1. List invoices (paginated + filtered)
  // ──────────────────────────────────────────────────────────────────
  async listInvoices(filters: ListInvoicesFilters = {}) {
    const { page = 1, limit = 25, status, invoiceType, companyId, dateFrom, dateTo, search } = filters;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }
    if (invoiceType) {
      where.invoiceType = invoiceType.toUpperCase();
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (companyId) {
      where.subscription = {
        tenant: {
          companyId,
        },
      };
    }
    if (search) {
      const searchCondition = {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
          {
            subscription: {
              tenant: {
                company: {
                  name: { contains: search, mode: 'insensitive' as const },
                },
              },
            },
          },
        ],
      };
      // Merge search condition with existing where
      if (Object.keys(where).length > 0) {
        where.AND = [searchCondition];
      } else {
        Object.assign(where, searchCondition);
      }
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

  // ──────────────────────────────────────────────────────────────────
  // 2. Get invoice by ID
  // ──────────────────────────────────────────────────────────────────
  async getInvoiceById(id: string) {
    const invoice = await platformPrisma.invoice.findUnique({
      where: { id },
      include: {
        payments: true,
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
    });

    return invoice;
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Generate invoice
  // ──────────────────────────────────────────────────────────────────
  async generateInvoice(params: GenerateInvoiceParams) {
    const { companyId, locationId, invoiceType, billingPeriodStart, billingPeriodEnd, customLineItems, notes } = params;

    // Fetch company with locations and tenant/subscription
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: {
        locations: true,
        tenant: {
          include: {
            subscriptions: true,
          },
        },
      },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    if (!company.tenant) {
      throw ApiError.badRequest('Company does not have a tenant record');
    }

    const subscription = company.tenant.subscriptions[0];
    if (!subscription) {
      throw ApiError.badRequest('Company does not have an active subscription');
    }

    // Fetch billing config
    const config = await pricingService.getConfig();

    // Generate invoice number atomically
    const invoiceNumber = await this.generateInvoiceNumber(config);

    // Build line items
    let lineItems: any[] = [];
    let subtotal = 0;

    if (customLineItems && customLineItems.length > 0) {
      lineItems = customLineItems;
      subtotal = customLineItems.reduce((sum, item) => sum + item.amount, 0);
    } else {
      // Auto-calculate from location/module data
      const locations = locationId
        ? company.locations.filter((loc: any) => loc.id === locationId)
        : company.locations;

      if (locations.length === 0) {
        throw ApiError.badRequest('No locations found for this company');
      }

      for (const location of locations) {
        const locationInput = {
          moduleIds: location.moduleIds as string[] | string | null,
          customModulePricing: location.customModulePricing as Record<string, number> | string | null,
          oneTimeLicenseFee: location.oneTimeLicenseFee,
          amcAmount: location.amcAmount,
          gstin: location.gstin,
          billingType: location.billingType,
        };

        const companyInput = {
          selectedModuleIds: company.selectedModuleIds as string[] | string | null,
          customModulePricing: company.customModulePricing as Record<string, number> | string | null,
          userTier: company.userTier,
          customTierPrice: company.customTierPrice ? Number(company.customTierPrice) : null,
          oneTimeMultiplier: company.oneTimeMultiplier,
          amcPercentage: company.amcPercentage,
        };

        switch (invoiceType) {
          case 'SUBSCRIPTION': {
            const monthly = pricingService.calculateLocationMonthlyCost(locationInput, companyInput);
            lineItems.push({
              description: `Monthly subscription - ${(location as any).name}`,
              locationId: location.id,
              locationName: (location as any).name,
              quantity: 1,
              unitPrice: monthly,
              amount: monthly,
            });
            subtotal += monthly;
            break;
          }
          case 'ONE_TIME_LICENSE': {
            const oneTime = pricingService.calculateOneTimeFee(locationInput, companyInput, config);
            lineItems.push({
              description: `One-time license fee - ${(location as any).name}`,
              locationId: location.id,
              locationName: (location as any).name,
              quantity: 1,
              unitPrice: oneTime,
              amount: oneTime,
            });
            subtotal += oneTime;
            break;
          }
          case 'AMC': {
            const amc = pricingService.calculateAmcFee(locationInput, companyInput, config);
            lineItems.push({
              description: `Annual maintenance contract - ${(location as any).name}`,
              locationId: location.id,
              locationName: (location as any).name,
              quantity: 1,
              unitPrice: amc,
              amount: amc,
            });
            subtotal += amc;
            break;
          }
          default:
            break;
        }
      }
    }

    subtotal = roundToDecimal(subtotal, 2);

    // Calculate GST — use the first location's GSTIN for now
    const firstLocation = locationId
      ? company.locations.find((loc: any) => loc.id === locationId)
      : company.locations[0];
    const locationGstin = firstLocation?.gstin ?? null;

    const gst = pricingService.calculateGST(
      config.platformGstin,
      locationGstin,
      subtotal,
      config,
    );

    const totalAmount = roundToDecimal(subtotal + gst.totalTax, 2);

    // Default due date: 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create the invoice
    const invoice = await platformPrisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: subtotal,
        status: 'PENDING',
        dueDate,
        invoiceNumber,
        invoiceType,
        lineItems: JSON.stringify(lineItems),
        subtotal,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        totalTax: gst.totalTax,
        totalAmount,
        billingPeriodStart: billingPeriodStart ?? null,
        billingPeriodEnd: billingPeriodEnd ?? null,
        gstNotApplicable: gst.gstNotApplicable,
      },
      include: {
        payments: true,
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
    });

    logger.info(`Invoice ${invoiceNumber} generated for company ${companyId}`);

    return invoice;
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. Mark invoice as paid
  // ──────────────────────────────────────────────────────────────────
  async markAsPaid(id: string, data: MarkAsPaidData) {
    const invoice = await platformPrisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw ApiError.badRequest('Invoice is already paid');
    }

    if (invoice.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot mark a cancelled invoice as paid');
    }

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

    // Update invoice and create payment in a transaction
    const [updatedInvoice, payment] = await platformPrisma.$transaction([
      platformPrisma.invoice.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt,
          paidVia: data.method,
          paymentReference: data.transactionReference ?? null,
        },
      }),
      platformPrisma.payment.create({
        data: {
          invoiceId: id,
          amount: invoice.totalAmount,
          method: data.method,
          transactionReference: data.transactionReference ?? null,
          paidAt,
          recordedBy: data.recordedBy,
          notes: data.notes ?? null,
        },
      }),
    ]);

    logger.info(`Invoice ${invoice.invoiceNumber} marked as paid via ${data.method}`);

    return { invoice: updatedInvoice, payment };
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. Void (cancel) invoice
  // ──────────────────────────────────────────────────────────────────
  async voidInvoice(id: string) {
    const invoice = await platformPrisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw ApiError.badRequest('Cannot void a paid invoice');
    }

    if (invoice.status === 'CANCELLED') {
      throw ApiError.badRequest('Invoice is already cancelled');
    }

    const updatedInvoice = await platformPrisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    logger.info(`Invoice ${invoice.invoiceNumber} voided`);

    return updatedInvoice;
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. Send invoice email
  // ──────────────────────────────────────────────────────────────────
  async sendInvoiceEmail(id: string) {
    const invoice = await platformPrisma.invoice.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            tenant: {
              include: {
                company: {
                  include: {
                    contacts: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw ApiError.notFound('Invoice not found');
    }

    const company = invoice.subscription?.tenant?.company;
    if (!company) {
      throw ApiError.badRequest('Company data not found for this invoice');
    }

    // Find billing contact or fall back to first contact
    const contacts = (company as any).contacts ?? [];
    const billingContact = contacts.find((c: any) => c.type === 'billing') ?? contacts[0];

    if (!billingContact) {
      throw ApiError.badRequest('No contacts found for this company');
    }

    const lineItems = typeof invoice.lineItems === 'string'
      ? JSON.parse(invoice.lineItems)
      : invoice.lineItems;

    const lineItemsHtml = Array.isArray(lineItems)
      ? lineItems
          .map(
            (item: any) =>
              `<tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${item.quantity ?? 1}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.unitPrice ?? item.amount ?? 0).toLocaleString('en-IN')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.amount ?? 0).toLocaleString('en-IN')}</td>
              </tr>`,
          )
          .join('')
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #4A3AFF;">Invoice ${invoice.invoiceNumber}</h2>
        <p>Dear ${billingContact.name},</p>
        <p>Please find the details of your invoice below:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #F3F0FF;">
            <td style="padding: 8px;"><strong>Invoice Number</strong></td>
            <td style="padding: 8px;">${invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px;"><strong>Status</strong></td>
            <td style="padding: 8px;">${invoice.status}</td>
          </tr>
          <tr style="background: #F3F0FF;">
            <td style="padding: 8px;"><strong>Due Date</strong></td>
            <td style="padding: 8px;">${invoice.dueDate.toLocaleDateString('en-IN')}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #4A3AFF; color: white;">
              <th style="padding: 8px; text-align: left;">Description</th>
              <th style="padding: 8px; text-align: right;">Qty</th>
              <th style="padding: 8px; text-align: right;">Unit Price</th>
              <th style="padding: 8px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>

        <table style="width: 100%; margin: 16px 0;">
          <tr><td style="padding: 4px;">Subtotal</td><td style="padding: 4px; text-align: right;">₹${invoice.subtotal.toLocaleString('en-IN')}</td></tr>
          ${!invoice.gstNotApplicable ? `
            ${invoice.cgst > 0 ? `<tr><td style="padding: 4px;">CGST</td><td style="padding: 4px; text-align: right;">₹${invoice.cgst.toLocaleString('en-IN')}</td></tr>` : ''}
            ${invoice.sgst > 0 ? `<tr><td style="padding: 4px;">SGST</td><td style="padding: 4px; text-align: right;">₹${invoice.sgst.toLocaleString('en-IN')}</td></tr>` : ''}
            ${invoice.igst > 0 ? `<tr><td style="padding: 4px;">IGST</td><td style="padding: 4px; text-align: right;">₹${invoice.igst.toLocaleString('en-IN')}</td></tr>` : ''}
          ` : '<tr><td style="padding: 4px; color: #999;">GST not applicable</td><td></td></tr>'}
          <tr style="font-weight: bold; border-top: 2px solid #333;">
            <td style="padding: 8px 4px;">Total Amount</td>
            <td style="padding: 8px 4px; text-align: right;">₹${invoice.totalAmount.toLocaleString('en-IN')}</td>
          </tr>
        </table>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} Avyren Technologies. All rights reserved.</p>
      </div>
    `;

    await sendEmail(
      billingContact.email,
      `Invoice ${invoice.invoiceNumber} - ${(company as any).displayName ?? (company as any).name}`,
      html,
    );

    // Update sentAt timestamp
    await platformPrisma.invoice.update({
      where: { id },
      data: { sentAt: new Date() },
    });

    logger.info(`Invoice email sent for ${invoice.invoiceNumber} to ${billingContact.email}`);

    return { sentTo: billingContact.email, invoiceNumber: invoice.invoiceNumber };
  }

  // ──────────────────────────────────────────────────────────────────
  // Helper: Generate invoice number (atomic)
  // ──────────────────────────────────────────────────────────────────
  private async generateInvoiceNumber(config: { id: string; invoicePrefix?: string; nextInvoiceSeq?: number }): Promise<string> {
    // Atomically increment the sequence
    const updated = await platformPrisma.platformBillingConfig.update({
      where: { id: config.id },
      data: { nextInvoiceSeq: { increment: 1 } },
    });

    const prefix = (config as any).invoicePrefix ?? 'INV';
    const year = new Date().getFullYear();
    const seq = String(updated.nextInvoiceSeq - 1).padStart(4, '0');

    return `${prefix}-${year}-${seq}`;
  }
}

export const invoiceService = new InvoiceService();
