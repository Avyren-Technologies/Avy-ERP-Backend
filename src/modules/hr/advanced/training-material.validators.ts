import { z } from 'zod';

export const createMaterialSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['PDF', 'VIDEO', 'LINK', 'PRESENTATION', 'DOCUMENT']),
  url: z.string().min(1, 'URL is required'),
  description: z.string().optional(),
  sequenceOrder: z.number().int().optional(),
  isMandatory: z.boolean().optional(),
});

export const updateMaterialSchema = createMaterialSchema.partial();
