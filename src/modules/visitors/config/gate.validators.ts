import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createGateSchema = z.object({
  plantId: z.string().min(1, 'Plant is required'),
  name: z.preprocess(trimString, z.string().min(1, 'Gate name is required').max(100)),
  code: z.preprocess(trimString, z.string().min(1, 'Gate code is required').max(20)),
  type: z.enum(['MAIN', 'SERVICE', 'LOADING_DOCK', 'VIP']).default('MAIN'),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm').optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm').optional(),
  allowedVisitorTypeIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const updateGateSchema = createGateSchema.partial();

export const gateListQuerySchema = z.object({
  plantId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
