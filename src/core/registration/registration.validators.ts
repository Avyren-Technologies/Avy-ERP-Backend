import { z } from 'zod';

export const registerCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(200),
  adminName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(10, 'Please enter a valid phone number').max(15),
});

export const updateRegistrationSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
}).refine(
  (data) => data.status !== 'REJECTED' || (data.rejectionReason && data.rejectionReason.length > 0),
  { message: 'Rejection reason is required when rejecting', path: ['rejectionReason'] }
);

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;
