import { z } from 'zod';

export const createTransferSchema = z.object({
  employeeId: z.string().min(1),
  toDepartmentId: z.string().optional(),
  toDesignationId: z.string().optional(),
  toLocationId: z.string().optional(),
  toManagerId: z.string().optional(),
  effectiveDate: z.string().min(1),
  reason: z.string().min(1),
  transferType: z.enum(['LATERAL', 'RELOCATION', 'RESTRUCTURING']).default('LATERAL'),
});

export const createPromotionSchema = z.object({
  employeeId: z.string().min(1),
  toDesignationId: z.string().min(1),
  toGradeId: z.string().optional(),
  newCtc: z.number().positive().optional(),
  effectiveDate: z.string().min(1),
  reason: z.string().optional(),
  appraisalEntryId: z.string().optional(),
});

export const approveSchema = z.object({
  note: z.string().optional(),
});
