import { z } from 'zod';

export const claimOvertimeSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine(
      (d) => {
        const date = new Date(d + 'T00:00:00Z');
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        return date < now;
      },
      'Date must be in the past',
    )
    .refine(
      (d) => {
        const date = new Date(d + 'T00:00:00Z');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
        return date >= thirtyDaysAgo;
      },
      'Date must be within the last 30 days',
    ),
  hours: z
    .number()
    .min(0.5, 'Minimum 0.5 hours')
    .max(24, 'Maximum 24 hours')
    .multipleOf(0.5, 'Hours must be in increments of 0.5'),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be at most 500 characters'),
  attachments: z
    .array(z.string().url('Each attachment must be a valid URL'))
    .max(5, 'Maximum 5 attachments')
    .optional(),
});

export const myOvertimeListSchema = z.object({
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'COMP_OFF_ACCRUED'])
    .optional(),
  source: z.enum(['AUTO', 'MANUAL']).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const myOvertimeSummarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export type ClaimOvertimeInput = z.infer<typeof claimOvertimeSchema>;
export type MyOvertimeListInput = z.infer<typeof myOvertimeListSchema>;
export type MyOvertimeSummaryInput = z.infer<typeof myOvertimeSummarySchema>;
