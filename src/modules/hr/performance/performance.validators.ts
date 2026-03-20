import { z } from 'zod';

// ── Appraisal Cycles ───────────────────────────────────────────────

export const createAppraisalCycleSchema = z.object({
  name: z.string().min(1, 'Cycle name is required'),
  frequency: z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY']).optional().default('ANNUAL'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  ratingScale: z.number().int().min(3).max(10).optional().default(5),
  ratingLabels: z.array(z.string()).optional(),
  kraWeightage: z.number().min(0).max(100).optional().default(70),
  competencyWeightage: z.number().min(0).max(100).optional().default(30),
  bellCurve: z.record(z.string(), z.number()).optional(),
  forcedDistribution: z.boolean().optional().default(false),
  midYearReview: z.boolean().optional().default(false),
  midYearMonth: z.number().int().min(1).max(12).optional(),
  managerEditDays: z.number().int().min(0).optional(),
});

export const updateAppraisalCycleSchema = createAppraisalCycleSchema.partial();

// ── Goals (KRA/OKR) ───────────────────────────────────────────────

export const createGoalSchema = z.object({
  cycleId: z.string().min(1, 'Cycle ID is required'),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  parentGoalId: z.string().optional(),
  title: z.string().min(1, 'Goal title is required'),
  description: z.string().optional(),
  kpiMetric: z.string().optional(),
  targetValue: z.number().optional(),
  weightage: z.number().min(0).max(100),
  level: z.enum(['COMPANY', 'DEPARTMENT', 'INDIVIDUAL']).optional().default('INDIVIDUAL'),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional().default('DRAFT'),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ cycleId: true });

// ── Appraisal Entries ──────────────────────────────────────────────

export const selfReviewSchema = z.object({
  selfRating: z.number().min(0).max(10),
  selfComments: z.string().optional(),
  kraScore: z.number().min(0).max(100).optional(),
  competencyScore: z.number().min(0).max(100).optional(),
  goalRatings: z.array(z.object({
    goalId: z.string().min(1),
    selfRating: z.number().int().min(1).max(10),
    achievedValue: z.number().optional(),
  })).optional(),
});

export const managerReviewSchema = z.object({
  managerRating: z.number().min(0).max(10),
  managerComments: z.string().optional(),
  kraScore: z.number().min(0).max(100).optional(),
  competencyScore: z.number().min(0).max(100).optional(),
  promotionRecommended: z.boolean().optional().default(false),
  incrementPercent: z.number().min(0).max(100).optional(),
  goalRatings: z.array(z.object({
    goalId: z.string().min(1),
    managerRating: z.number().int().min(1).max(10),
  })).optional(),
});

export const publishEntrySchema = z.object({
  finalRating: z.number().min(0).max(10),
});

// ── 360 Feedback ───────────────────────────────────────────────────

export const createFeedback360Schema = z.object({
  cycleId: z.string().min(1, 'Cycle ID is required'),
  employeeId: z.string().min(1, 'Employee (subject) ID is required'),
  raterId: z.string().min(1, 'Rater ID is required'),
  raterType: z.enum(['SELF', 'MANAGER', 'PEER', 'SUBORDINATE', 'CROSS_FUNCTION', 'INTERNAL_CUSTOMER']),
  ratings: z.record(z.string(), z.number().min(1).max(10)),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
  wouldWorkAgain: z.boolean().optional(),
  isAnonymous: z.boolean().optional().default(true),
});

export const updateFeedback360Schema = z.object({
  ratings: z.record(z.string(), z.number().min(1).max(10)).optional(),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
  wouldWorkAgain: z.boolean().optional(),
});

// ── Skill Library ──────────────────────────────────────────────────

export const createSkillSchema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
});

export const updateSkillSchema = createSkillSchema.partial();

// ── Skill Mappings ─────────────────────────────────────────────────

export const createSkillMappingSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  skillId: z.string().min(1, 'Skill ID is required'),
  currentLevel: z.number().int().min(1).max(5).optional().default(1),
  requiredLevel: z.number().int().min(1).max(5).optional().default(3),
  assessedBy: z.string().optional(),
});

export const updateSkillMappingSchema = z.object({
  currentLevel: z.number().int().min(1).max(5).optional(),
  requiredLevel: z.number().int().min(1).max(5).optional(),
  assessedBy: z.string().optional(),
});

// ── Succession Plans ───────────────────────────────────────────────

export const createSuccessionPlanSchema = z.object({
  criticalRoleTitle: z.string().min(1, 'Critical role title is required'),
  criticalRoleDesignationId: z.string().optional(),
  successorId: z.string().min(1, 'Successor ID is required'),
  readiness: z.enum(['READY_NOW', 'ONE_YEAR', 'TWO_YEARS', 'NOT_READY']).optional().default('NOT_READY'),
  developmentPlan: z.string().optional(),
  performanceRating: z.number().min(0).max(10).optional(),
  potentialRating: z.number().min(0).max(10).optional(),
  nineBoxPosition: z.string().optional(),
});

export const updateSuccessionPlanSchema = createSuccessionPlanSchema.partial().omit({
  successorId: true,
});
