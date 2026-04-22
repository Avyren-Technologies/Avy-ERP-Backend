import { z } from 'zod';

const halfSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'ON_LEAVE'], {
    errorMap: () => ({ message: 'Status must be PRESENT, ABSENT, or ON_LEAVE' }),
  }),
  leaveTypeId: z.string().min(1).optional(),
}).refine(
  (d) => d.status !== 'ON_LEAVE' || (d.leaveTypeId && d.leaveTypeId.length > 0),
  { message: 'leaveTypeId is required when status is ON_LEAVE' },
);

export const bookFetchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  shiftId: z.string().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
});

export const bookMarkSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  firstHalf: halfSchema,
  secondHalf: halfSchema,
  punchInOverride: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm').optional(),
  punchOutOverride: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm').optional(),
  remarks: z.string().max(500).optional(),
  forceOverride: z.boolean().optional(),
  existingRecordUpdatedAt: z.string().datetime().optional(),
}).refine(
  (d) => {
    if (d.punchInOverride || d.punchOutOverride) {
      return d.firstHalf.status === 'PRESENT' || d.secondHalf.status === 'PRESENT';
    }
    return true;
  },
  { message: 'Punch overrides require at least one half marked PRESENT' },
);

export const bookSaveAllSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  entries: z.array(z.object({
    employeeId: z.string().min(1),
    firstHalf: halfSchema,
    secondHalf: halfSchema,
    punchInOverride: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    punchOutOverride: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    remarks: z.string().max(500).optional(),
    forceOverride: z.boolean().optional(),
    existingRecordUpdatedAt: z.string().datetime().optional(),
  })).min(1, 'At least one entry required').max(100, 'Maximum 100 entries per batch'),
});

export type BookFetchInput = z.infer<typeof bookFetchSchema>;
export type BookMarkInput = z.infer<typeof bookMarkSchema>;
export type BookSaveAllInput = z.infer<typeof bookSaveAllSchema>;
