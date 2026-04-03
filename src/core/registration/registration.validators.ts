import { z } from 'zod';

export const registerCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(200),
  adminName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(10, 'Please enter a valid phone number').max(15),
});

export const updateRegistrationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('APPROVED'),
  }),
  z.object({
    status: z.literal('REJECTED'),
    rejectionReason: z
      .string()
      .trim()
      .min(1, 'Rejection reason is required when rejecting')
      .max(5000, 'Rejection reason is too long'),
  }),
]);

/** Super-admin list filter — must match Prisma `RegistrationRequestStatus`. */
export const listRegistrationsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;
