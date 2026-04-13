import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createVisitorTypeSchema = z.object({
  name: z.preprocess(trimString, z.string().min(1, 'Name is required').max(100)),
  code: z.preprocess(trimString, z.string().min(1, 'Code is required').max(5).toUpperCase()),
  badgeColour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex colour').default('#3B82F6'),
  requirePhoto: z.boolean().default(true),
  requireIdVerification: z.boolean().default(true),
  requireSafetyInduction: z.boolean().default(false),
  requireNda: z.boolean().default(false),
  requireHostApproval: z.boolean().default(true),
  requireEscort: z.boolean().default(false),
  defaultMaxDurationMinutes: z.number().int().min(15).max(1440).optional(),
  safetyInductionId: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateVisitorTypeSchema = createVisitorTypeSchema.partial();

export const visitorTypeListQuerySchema = z.object({
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
