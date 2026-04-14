import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

const watchlistBaseSchema = z.object({
  type: z.enum(['BLOCKLIST', 'WATCHLIST']),
  personName: z.preprocess(trimString, z.string().min(1, 'Person name is required').max(200)),
  mobileNumber: z.preprocess(trimString, z.string().max(15)).optional(),
  email: z.preprocess(trimString, z.string().email().max(200)).optional(),
  idNumber: z.preprocess(trimString, z.string().max(50)).optional(),
  photo: z.string().url().optional(),
  reason: z.preprocess(trimString, z.string().min(1, 'Reason is required').max(500)),
  actionRequired: z.preprocess(trimString, z.string().max(500)).optional(),
  blockDuration: z.enum(['PERMANENT', 'UNTIL_DATE']),
  expiryDate: z.string().optional(),
  appliesToAllPlants: z.boolean().default(true),
  plantIds: z.array(z.string()).default([]),
});

export const createWatchlistSchema = watchlistBaseSchema
  .refine(
    (data) => data.appliesToAllPlants || data.plantIds.length > 0,
    { message: 'At least one plant must be selected when appliesToAllPlants is false', path: ['plantIds'] },
  )
  .refine(
    (data) => data.blockDuration !== 'UNTIL_DATE' || !!data.expiryDate,
    { message: 'Expiry date is required when block duration is UNTIL_DATE', path: ['expiryDate'] },
  )
  .refine(
    (data) => data.blockDuration !== 'PERMANENT' || !data.expiryDate,
    { message: 'Expiry date should not be set for permanent blocks', path: ['expiryDate'] },
  );

export const updateWatchlistSchema = watchlistBaseSchema.partial().refine(
  (data) => {
    if (data.appliesToAllPlants === false && data.plantIds !== undefined) {
      return data.plantIds.length > 0;
    }
    return true;
  },
  { message: 'At least one plant must be selected when appliesToAllPlants is false', path: ['plantIds'] },
).refine(
  (data) => {
    if (data.blockDuration === 'UNTIL_DATE' && data.expiryDate === undefined) {
      return false;
    }
    return true;
  },
  { message: 'Expiry date is required when changing block duration to UNTIL_DATE', path: ['expiryDate'] },
).refine(
  (data) => {
    if (data.blockDuration === 'PERMANENT' && data.expiryDate) {
      return false;
    }
    return true;
  },
  { message: 'Expiry date should not be set for permanent blocks', path: ['expiryDate'] },
);

export const watchlistListQuerySchema = z.object({
  type: z.enum(['BLOCKLIST', 'WATCHLIST']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const watchlistCheckSchema = z.object({
  name: z.preprocess(trimString, z.string()).optional(),
  mobile: z.preprocess(trimString, z.string()).optional(),
  idNumber: z.preprocess(trimString, z.string()).optional(),
});
