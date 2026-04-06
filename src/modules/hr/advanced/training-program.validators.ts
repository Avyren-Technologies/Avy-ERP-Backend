import { z } from 'zod';

export const createProgramSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  level: z.string().optional(),
  totalDuration: z.string().optional(),
  isCompulsory: z.boolean().optional(),
});

export const updateProgramSchema = createProgramSchema.partial();

export const addCourseSchema = z.object({
  trainingId: z.string().min(1, 'Training ID is required'),
  sequenceOrder: z.number().int().positive(),
  isPrerequisite: z.boolean().optional(),
  minPassScore: z.number().min(0).max(100).optional(),
});

export const enrollSchema = z.object({
  employeeIds: z.array(z.string()).min(1, 'At least one employee is required'),
});
