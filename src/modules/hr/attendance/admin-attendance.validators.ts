import { z } from 'zod';

export const adminMarkSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  action: z.enum(['CHECK_IN', 'CHECK_OUT'], {
    errorMap: () => ({ message: 'Action must be CHECK_IN or CHECK_OUT' }),
  }),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  photoUrl: z.string().optional(),
  remarks: z.string().optional(),
  skipValidation: z.boolean().optional(),
});

export const adminBulkMarkSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, 'At least one employee is required').max(50, 'Maximum 50 employees per bulk operation'),
  action: z.enum(['CHECK_IN', 'CHECK_OUT'], {
    errorMap: () => ({ message: 'Action must be CHECK_IN or CHECK_OUT' }),
  }),
  remarks: z.string().min(1, 'Remarks are required for bulk operations'),
});

export const todayLogSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  search: z.string().optional(),
});
