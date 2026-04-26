import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createVisitSchema = z.object({
  visitorName: z.preprocess(trimString, z.string().min(1, 'Visitor name is required').max(200)),
  visitorMobile: z.preprocess(trimString, z.string().min(10, 'Valid mobile number required').max(15)),
  visitorEmail: z.preprocess(trimString, z.string().email().max(200)).optional(),
  visitorCompany: z.preprocess(trimString, z.string().max(200)).optional(),
  visitorDesignation: z.preprocess(trimString, z.string().max(100)).optional(),
  visitorTypeId: z.string().min(1, 'Visitor type is required'),
  purpose: z.enum(['MEETING', 'DELIVERY', 'MAINTENANCE', 'AUDIT', 'INTERVIEW', 'SITE_TOUR', 'PERSONAL', 'OTHER']),
  purposeNotes: z.preprocess(trimString, z.string().max(500)).optional(),
  expectedDate: z.string().min(1, 'Expected date is required'),
  expectedTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').optional(),
  expectedDurationMinutes: z.number().int().min(15).max(1440).optional(),
  hostEmployeeId: z.string().optional(),
  plantId: z.string().min(1, 'Plant is required'),
  gateId: z.string().optional(),
  vehicleRegNumber: z.preprocess(trimString, z.string().max(20)).optional(),
  vehicleType: z.preprocess(trimString, z.string().max(30)).optional(),
  materialCarriedIn: z.preprocess(trimString, z.string().max(500)).optional(),
  specialInstructions: z.preprocess(trimString, z.string().max(500)).optional(),
  emergencyContact: z.preprocess(trimString, z.string().max(100)).optional(),
  meetingRef: z.preprocess(trimString, z.string().max(50)).optional(),
  purchaseOrderRef: z.preprocess(trimString, z.string().max(50)).optional(),
});

export const updateVisitSchema = createVisitSchema.partial();

export const checkInSchema = z.object({
  checkInGateId: z.string().min(1, 'Gate is required').optional(),
  checkInGuardId: z.string().optional(),
  visitorPhoto: z.string().url().optional(),
  governmentIdType: z.enum(['AADHAAR', 'PAN', 'DRIVING_LICENCE', 'PASSPORT', 'VOTER_ID']).optional(),
  governmentIdNumber: z.preprocess(trimString, z.string().max(50)).optional(),
  idDocumentPhoto: z.string().url().optional(),
  badgeFormat: z.enum(['DIGITAL', 'PRINTED']).optional(),
});

export const checkOutSchema = z.object({
  checkOutGateId: z.string().optional(),
  checkOutMethod: z.enum(['SECURITY_DESK', 'HOST_INITIATED', 'MOBILE_LINK', 'AUTO_CHECKOUT']),
  badgeReturned: z.boolean().optional(),
  materialOut: z.preprocess(trimString, z.string().max(500)).optional(),
});

export const extendVisitSchema = z.object({
  additionalMinutes: z.number().int().min(15, 'Minimum 15 minutes').max(1440, 'Maximum 24 hours'),
  reason: z.preprocess(trimString, z.string().min(1, 'Reason is required').max(500)),
});

export const approveRejectSchema = z.object({
  notes: z.preprocess(trimString, z.string().max(500)).optional(),
});

export const visitListQuerySchema = z.object({
  status: z.string().optional(),
  visitorTypeId: z.string().optional(),
  hostEmployeeId: z.string().optional(),
  plantId: z.string().optional(),
  gateId: z.string().optional(),
  registrationMethod: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const completeInductionSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  passed: z.boolean(),
});
