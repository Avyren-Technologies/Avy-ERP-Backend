import { z } from 'zod';

export const createTrainerSchema = z.object({
  employeeId: z.string().optional(),
  externalName: z.string().optional(),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  specializations: z.array(z.string()).optional(),
  qualifications: z.string().optional(),
  experienceYears: z.number().int().min(0).optional(),
  isInternal: z.boolean().optional(),
}).refine(
  (data) => data.employeeId || data.externalName,
  { message: 'Either employeeId or externalName is required' },
);

export const updateTrainerSchema = z.object({
  employeeId: z.string().optional(),
  externalName: z.string().optional(),
  email: z.string().email('Valid email required').optional(),
  phone: z.string().optional(),
  specializations: z.array(z.string()).optional(),
  qualifications: z.string().optional(),
  experienceYears: z.number().int().min(0).optional(),
  isInternal: z.boolean().optional(),
});
