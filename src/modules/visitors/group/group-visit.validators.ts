import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createGroupVisitSchema = z.object({
  groupName: z.preprocess(trimString, z.string().min(1, 'Group name is required').max(200)),
  hostEmployeeId: z.string().min(1, 'Host employee is required'),
  purpose: z.preprocess(trimString, z.string().min(1, 'Purpose is required').max(500)),
  expectedDate: z.string().min(1, 'Expected date is required'),
  expectedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plantId: z.string().min(1, 'Plant is required'),
  gateId: z.string().optional(),
  members: z.array(z.object({
    visitorName: z.preprocess(trimString, z.string().min(1).max(200)),
    visitorMobile: z.preprocess(trimString, z.string().min(10).max(15)),
    visitorEmail: z.preprocess(trimString, z.string().email().max(200)).optional(),
    visitorCompany: z.preprocess(trimString, z.string().max(200)).optional(),
  })).min(2, 'Group visit requires at least 2 members').max(100),
});

export const updateGroupVisitSchema = z.object({
  groupName: z.preprocess(trimString, z.string().min(1).max(200)).optional(),
  purpose: z.preprocess(trimString, z.string().min(1).max(500)).optional(),
  expectedDate: z.string().optional(),
  expectedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const batchCheckInSchema = z.object({
  memberIds: z.array(z.string()).min(1, 'At least one member is required'),
  checkInGateId: z.string().min(1, 'Gate is required'),
});

export const batchCheckOutSchema = z.object({
  memberIds: z.array(z.string()).optional(),
  checkOutGateId: z.string().optional(),
  checkOutMethod: z.enum(['SECURITY_DESK', 'HOST_INITIATED']).default('SECURITY_DESK'),
});

export const groupVisitListQuerySchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
