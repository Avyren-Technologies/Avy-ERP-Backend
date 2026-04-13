import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createSafetyInductionSchema = z.object({
  name: z.preprocess(trimString, z.string().min(1, 'Name is required').max(200)),
  type: z.enum(['VIDEO', 'SLIDES', 'QUESTIONNAIRE', 'DECLARATION']),
  contentUrl: z.string().url().optional(),
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()),
    correctAnswer: z.number().int(),
  })).optional(),
  passingScore: z.number().int().min(0).max(100).default(80),
  durationSeconds: z.number().int().min(10).max(600).default(120),
  validityDays: z.number().int().min(1).max(365).default(30),
  plantId: z.string().optional(),
});

export const updateSafetyInductionSchema = createSafetyInductionSchema.partial();

export const safetyInductionListQuerySchema = z.object({
  plantId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
