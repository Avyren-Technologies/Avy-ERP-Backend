import { z } from 'zod';

export const createEvaluationSchema = z.object({
  evaluations: z.array(z.object({
    dimension: z.string().min(1, 'Dimension is required'),
    rating: z.number().int().min(1).max(5),
    comments: z.string().optional(),
    recommendation: z.enum(['STRONG_HIRE', 'HIRE', 'MAYBE', 'NO_HIRE', 'STRONG_NO_HIRE']),
  })).min(1, 'At least one evaluation is required'),
});
