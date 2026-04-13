import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createWatchlistSchema = z.object({
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

export const updateWatchlistSchema = createWatchlistSchema.partial();

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
