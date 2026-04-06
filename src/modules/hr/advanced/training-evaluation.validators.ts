import { z } from 'zod';

export const createTrainingEvaluationSchema = z.object({
  nominationId: z.string().min(1, 'Nomination ID is required'),
  sessionId: z.string().optional(),
  type: z.enum(['PARTICIPANT_FEEDBACK', 'TRAINER_ASSESSMENT']),
  contentRelevance: z.number().int().min(1).max(5).optional(),
  trainerEffectiveness: z.number().int().min(1).max(5).optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  knowledgeGain: z.number().int().min(1).max(5).optional(),
  practicalApplicability: z.number().int().min(1).max(5).optional(),
  preAssessmentScore: z.number().min(0).max(100).optional(),
  postAssessmentScore: z.number().min(0).max(100).optional(),
  comments: z.string().optional(),
  improvementSuggestions: z.string().optional(),
});

export const submitEssFeedbackSchema = z.object({
  sessionId: z.string().optional(),
  contentRelevance: z.number().int().min(1).max(5).optional(),
  trainerEffectiveness: z.number().int().min(1).max(5).optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  knowledgeGain: z.number().int().min(1).max(5).optional(),
  practicalApplicability: z.number().int().min(1).max(5).optional(),
  preAssessmentScore: z.number().min(0).max(100).optional(),
  postAssessmentScore: z.number().min(0).max(100).optional(),
  comments: z.string().optional(),
  improvementSuggestions: z.string().optional(),
});

export type CreateTrainingEvaluationInput = z.infer<typeof createTrainingEvaluationSchema>;
export type SubmitEssFeedbackInput = z.infer<typeof submitEssFeedbackSchema>;
