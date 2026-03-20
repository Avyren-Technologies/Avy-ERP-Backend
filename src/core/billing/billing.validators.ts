import { z } from 'zod';

// ── Invoice ────────────────────────────────────────────────────────

export const generateInvoiceSchema = z.object({
  companyId: z.string().min(1),
  locationId: z.string().optional(),
  invoiceType: z.enum(['SUBSCRIPTION', 'ONE_TIME_LICENSE', 'AMC', 'PRORATED_ADJUSTMENT']),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  customLineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().min(0),
        unitPrice: z.number().min(0),
        amount: z.number().min(0),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

export const markAsPaidSchema = z.object({
  method: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'RAZORPAY', 'UPI', 'OTHER']),
  transactionReference: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
});

// ── Payment ────────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'RAZORPAY', 'UPI', 'OTHER']),
  transactionReference: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
});

// ── Subscription ───────────────────────────────────────────────────

export const changeBillingTypeSchema = z.object({
  billingType: z.enum(['MONTHLY', 'ANNUAL', 'ONE_TIME_AMC']),
  locationId: z.string().optional(),
  oneTimeOverride: z.number().min(0).optional(),
  amcOverride: z.number().min(0).optional(),
});

export const changeTierSchema = z.object({
  newTier: z.string().min(1),
  locationId: z.string().optional(),
  customUserLimit: z.string().optional(),
  customTierPrice: z.string().optional(),
});

export const extendTrialSchema = z.object({
  newEndDate: z.string().min(1),
  locationId: z.string().optional(),
});

// ── Billing Config ─────────────────────────────────────────────────

export const updateBillingConfigSchema = z.object({
  defaultOneTimeMultiplier: z.number().min(0).optional(),
  defaultAmcPercentage: z.number().min(0).max(100).optional(),
  defaultCgstRate: z.number().min(0).max(100).optional(),
  defaultSgstRate: z.number().min(0).max(100).optional(),
  defaultIgstRate: z.number().min(0).max(100).optional(),
  platformGstin: z.string().optional(),
  invoicePrefix: z.string().optional(),
});
