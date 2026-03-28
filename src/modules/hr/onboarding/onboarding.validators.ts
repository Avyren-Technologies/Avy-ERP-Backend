import { z } from 'zod';

// ── Template Schemas ──────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  items: z.array(z.object({
    title: z.string().min(1, 'Item title is required'),
    department: z.string().min(1, 'Department is required'),
    description: z.string().optional(),
    dueInDays: z.number().int().min(0).optional(),
    isMandatory: z.boolean().optional(),
  })).min(1, 'At least one item is required'),
  isDefault: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

// ── Task Schemas ──────────────────────────────────────────────────────

export const generateTasksSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  templateId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
  notes: z.string().optional(),
});

// ── Probation Review Schema ───────────────────────────────────────────

export const probationReviewSchema = z.object({
  performanceRating: z.number().int().min(1).max(5),
  managerFeedback: z.string().min(1, 'Manager feedback is required'),
  decision: z.enum(['CONFIRMED', 'EXTENDED', 'TERMINATED']),
  extensionMonths: z.number().int().min(1).max(6).optional(),
});
