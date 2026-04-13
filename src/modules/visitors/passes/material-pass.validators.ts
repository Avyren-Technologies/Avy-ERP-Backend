import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createMaterialPassSchema = z.object({
  type: z.enum(['INWARD', 'OUTWARD', 'RETURNABLE']),
  description: z.preprocess(trimString, z.string().min(1, 'Description is required').max(500)),
  quantityIssued: z.preprocess(trimString, z.string().max(100)).optional(),
  visitId: z.string().optional(),
  authorizedBy: z.string().min(1, 'Authorized by is required'),
  purpose: z.preprocess(trimString, z.string().min(1, 'Purpose is required').max(500)),
  expectedReturnDate: z.string().optional(),
  gateId: z.string().min(1, 'Gate is required'),
  plantId: z.string().min(1, 'Plant is required'),
});

export const materialReturnSchema = z.object({
  quantityReturned: z.preprocess(trimString, z.string().min(1, 'Quantity returned is required').max(100)),
  returnStatus: z.enum(['PARTIAL', 'FULLY_RETURNED']),
});

export const materialPassListQuerySchema = z.object({
  type: z.enum(['INWARD', 'OUTWARD', 'RETURNABLE']).optional(),
  returnStatus: z.enum(['NOT_APPLICABLE', 'PENDING_RETURN', 'PARTIAL', 'FULLY_RETURNED']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
