import { z } from 'zod';

export const createBudgetSchema = z.object({
  fiscalYear: z.string().min(1, 'Fiscal year is required'),
  departmentId: z.string().optional(),
  allocatedAmount: z.number().positive('Allocated amount must be positive'),
});

export const updateBudgetSchema = z.object({
  allocatedAmount: z.number().positive('Allocated amount must be positive').optional(),
});
