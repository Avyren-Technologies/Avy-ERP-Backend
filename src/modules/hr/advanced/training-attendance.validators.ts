import { z } from 'zod';

export const registerAttendeesSchema = z.object({
  employeeIds: z.array(z.string()).min(1, 'At least one employee is required'),
  nominationIds: z.record(z.string()).optional(), // Map of employeeId -> nominationId
});

export const markAttendanceSchema = z.object({
  status: z.enum(['REGISTERED', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  remarks: z.string().optional(),
});

export const bulkMarkAttendanceSchema = z.object({
  attendances: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(['REGISTERED', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    remarks: z.string().optional(),
  })).min(1),
});
