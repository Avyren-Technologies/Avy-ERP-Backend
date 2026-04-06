import { z } from 'zod';

export const createOfferSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  designationId: z.string().optional(),
  departmentId: z.string().optional(),
  offeredCtc: z.number().positive('Offered CTC must be positive'),
  ctcBreakup: z.record(z.any()).optional(),
  joiningDate: z.string().optional(),
  offerLetterUrl: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

export const updateOfferSchema = createOfferSchema.partial().omit({ candidateId: true });

export const updateOfferStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED']),
  rejectionReason: z.string().optional(),
}).refine(
  (data) => {
    if (data.status === 'REJECTED') return !!data.rejectionReason;
    return true;
  },
  { message: 'Rejection reason is required when rejecting', path: ['rejectionReason'] },
);
