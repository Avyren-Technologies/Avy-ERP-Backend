import { z } from 'zod';

export const createSessionSchema = z.object({
  trainingId: z.string().min(1, 'Training ID is required'),
  batchName: z.string().optional(),
  startDateTime: z.string().min(1, 'Start date/time is required'),
  endDateTime: z.string().min(1, 'End date/time is required'),
  venue: z.string().optional(),
  meetingLink: z.string().optional(),
  maxParticipants: z.number().int().positive().optional(),
  trainerId: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSessionSchema = createSessionSchema.partial().omit({ trainingId: true });

export const updateSessionStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  cancelledReason: z.string().optional(),
}).refine(
  (data) => {
    if (data.status === 'CANCELLED') return !!data.cancelledReason;
    return true;
  },
  { message: 'Cancellation reason is required', path: ['cancelledReason'] },
);
