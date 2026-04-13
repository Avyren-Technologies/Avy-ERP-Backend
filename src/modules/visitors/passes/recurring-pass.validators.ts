import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createRecurringPassSchema = z.object({
  visitorName: z.preprocess(trimString, z.string().min(1).max(200)),
  visitorCompany: z.preprocess(trimString, z.string().min(1).max(200)),
  visitorMobile: z.preprocess(trimString, z.string().min(10).max(15)),
  visitorEmail: z.preprocess(trimString, z.string().email().max(200)).optional(),
  visitorPhoto: z.string().url().optional(),
  visitorIdType: z.string().optional(),
  visitorIdNumber: z.preprocess(trimString, z.string().max(50)).optional(),
  passType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
  validFrom: z.string().min(1, 'Valid from date is required'),
  validUntil: z.string().min(1, 'Valid until date is required'),
  allowedDays: z.array(z.number().int().min(0).max(6)).default([]),
  allowedTimeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  allowedTimeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  allowedGateIds: z.array(z.string()).default([]),
  hostEmployeeId: z.string().min(1, 'Host employee is required'),
  purpose: z.preprocess(trimString, z.string().min(1).max(500)),
  plantId: z.string().min(1, 'Plant is required'),
});

export const updateRecurringPassSchema = createRecurringPassSchema.partial();

export const revokePassSchema = z.object({
  reason: z.preprocess(trimString, z.string().min(1, 'Revoke reason is required').max(500)),
});

export const recurringPassListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
