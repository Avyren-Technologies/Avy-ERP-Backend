import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// RECRUITMENT
// ═══════════════════════════════════════════════════════════════════

export const createRequisitionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  designationId: z.string().optional(),
  departmentId: z.string().optional(),
  openings: z.number().int().min(1).optional().default(1),
  description: z.string().optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  targetDate: z.string().optional(),
  sourceChannels: z.array(z.string()).optional(),
  approvedBy: z.string().optional(),
});

export const updateRequisitionSchema = createRequisitionSchema.partial();

export const updateRequisitionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'INTERVIEWING', 'OFFERED', 'FILLED', 'CANCELLED']),
});

export const createCandidateSchema = z.object({
  requisitionId: z.string().min(1, 'Requisition ID is required'),
  name: z.string().min(1, 'Candidate name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  source: z.string().optional(),
  currentCtc: z.number().min(0).optional(),
  expectedCtc: z.number().min(0).optional(),
  resumeUrl: z.string().optional(),
  rating: z.number().min(0).max(10).optional(),
  notes: z.string().optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial().omit({ requisitionId: true });

export const advanceCandidateStageSchema = z.object({
  stage: z.enum([
    'APPLIED', 'SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL',
    'ASSESSMENT', 'OFFER_SENT', 'HIRED', 'REJECTED', 'ON_HOLD',
  ]),
});

export const createInterviewSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  round: z.string().min(1, 'Round is required'),
  panelists: z.array(z.string()).optional(),
  scheduledAt: z.string().min(1, 'Scheduled date/time is required'),
  duration: z.number().int().min(1).optional(),
  meetingLink: z.string().optional(),
});

export const updateInterviewSchema = z.object({
  round: z.string().optional(),
  panelists: z.array(z.string()).optional(),
  scheduledAt: z.string().optional(),
  duration: z.number().int().min(1).optional(),
  meetingLink: z.string().optional(),
});

export const completeInterviewSchema = z.object({
  feedbackRating: z.number().min(0).max(10),
  feedbackNotes: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// TRAINING
// ═══════════════════════════════════════════════════════════════════

export const createTrainingCatalogueSchema = z.object({
  name: z.string().min(1, 'Training name is required'),
  type: z.string().optional().default('TECHNICAL'),
  mode: z.enum(['ONLINE', 'CLASSROOM', 'WORKSHOP', 'EXTERNAL', 'BLENDED', 'ON_THE_JOB']).optional().default('CLASSROOM'),
  duration: z.string().optional(),
  linkedSkillIds: z.array(z.string()).optional(),
  proficiencyGain: z.number().int().min(0).max(5).optional().default(1),
  mandatory: z.boolean().optional().default(false),
  certificationName: z.string().optional(),
  certificationBody: z.string().optional(),
  certificationValidity: z.number().int().min(0).optional(),
  vendorProvider: z.string().optional(),
  costPerHead: z.number().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateTrainingCatalogueSchema = createTrainingCatalogueSchema.partial();

export const createTrainingNominationSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  trainingId: z.string().min(1, 'Training ID is required'),
});

export const updateTrainingNominationSchema = z.object({
  status: z.enum(['NOMINATED', 'ENROLLED', 'COMPLETED', 'CANCELLED']).optional(),
  completionDate: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  certificateUrl: z.string().optional(),
});

export const completeTrainingNominationSchema = z.object({
  completionDate: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  certificateUrl: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// ASSET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

export const createAssetCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  depreciationRate: z.number().min(0).max(100).optional(),
  returnChecklist: z.array(z.string()).optional(),
});

export const updateAssetCategorySchema = createAssetCategorySchema.partial();

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseValue: z.number().min(0).optional(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST']).optional().default('NEW'),
});

export const updateAssetSchema = createAssetSchema.partial().omit({ categoryId: true }).extend({
  categoryId: z.string().optional(),
  status: z.enum(['IN_STOCK', 'ASSIGNED', 'UNDER_REPAIR', 'PENDING_RETURN', 'RETIRED']).optional(),
});

export const createAssetAssignmentSchema = z.object({
  assetId: z.string().min(1, 'Asset ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  issueDate: z.string().min(1, 'Issue date is required'),
  notes: z.string().optional(),
});

export const returnAssetSchema = z.object({
  returnDate: z.string().min(1, 'Return date is required'),
  returnCondition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST']),
  notes: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// EXPENSE CLAIMS
// ═══════════════════════════════════════════════════════════════════

export const createExpenseClaimSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  title: z.string().min(1, 'Title is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  category: z.string().min(1, 'Category is required'),
  receipts: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string(),
  })).optional(),
  description: z.string().optional(),
  tripDate: z.string().optional(),
});

export const updateExpenseClaimSchema = createExpenseClaimSchema.partial().omit({ employeeId: true });

export const approveRejectClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  approvedBy: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// HR LETTER TEMPLATES & LETTERS
// ═══════════════════════════════════════════════════════════════════

export const createLetterTemplateSchema = z.object({
  type: z.string().min(1, 'Template type is required'),
  name: z.string().min(1, 'Template name is required'),
  bodyTemplate: z.string().min(1, 'Template body is required'),
  isActive: z.boolean().optional().default(true),
});

export const updateLetterTemplateSchema = createLetterTemplateSchema.partial();

export const createLetterSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  effectiveDate: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// GRIEVANCE
// ═══════════════════════════════════════════════════════════════════

export const createGrievanceCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  slaHours: z.number().int().min(1).optional().default(72),
  autoEscalateTo: z.string().optional(),
});

export const updateGrievanceCategorySchema = createGrievanceCategorySchema.partial();

export const createGrievanceCaseSchema = z.object({
  employeeId: z.string().optional(),
  categoryId: z.string().min(1, 'Category ID is required'),
  description: z.string().min(1, 'Description is required'),
  isAnonymous: z.boolean().optional().default(false),
});

export const updateGrievanceCaseSchema = z.object({
  description: z.string().optional(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'ESCALATED']).optional(),
  resolution: z.string().optional(),
  resolvedBy: z.string().optional(),
});

export const resolveGrievanceCaseSchema = z.object({
  resolution: z.string().min(1, 'Resolution is required'),
  resolvedBy: z.string().min(1, 'Resolved by is required'),
});

// ═══════════════════════════════════════════════════════════════════
// DISCIPLINARY ACTIONS
// ═══════════════════════════════════════════════════════════════════

export const createDisciplinaryActionSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  type: z.enum(['VERBAL_WARNING', 'WRITTEN_WARNING', 'SHOW_CAUSE', 'PIP', 'SUSPENSION', 'TERMINATION']),
  charges: z.string().min(1, 'Charges are required'),
  replyDueBy: z.string().optional(),
  pipDuration: z.number().int().min(1).optional(),
  issuedBy: z.string().optional(),
});

export const updateDisciplinaryActionSchema = z.object({
  charges: z.string().optional(),
  replyDueBy: z.string().optional(),
  replyReceived: z.string().optional(),
  pipDuration: z.number().int().min(1).optional(),
  pipOutcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILURE']).optional(),
  status: z.string().optional(),
  issuedBy: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// BONUS BATCHES
// ═══════════════════════════════════════════════════════════════════

export const createBonusBatchSchema = z.object({
  name: z.string().min(1).max(200),
  bonusType: z.enum(['PERFORMANCE', 'FESTIVE', 'SPOT', 'REFERRAL', 'RETENTION', 'STATUTORY']),
  items: z.array(z.object({
    employeeId: z.string().min(1),
    amount: z.number().positive(),
    remarks: z.string().optional(),
  })).min(1),
});

export const mergeBonusBatchSchema = z.object({
  payrollRunId: z.string().min(1),
});

// ═══════════════════════════════════════════════════════════════════
// E-SIGN (ORA-7)
// ═══════════════════════════════════════════════════════════════════

export const eSignCallbackSchema = z.object({
  signingToken: z.string().min(1, 'Signing token is required'),
  status: z.enum(['SIGNED', 'DECLINED']),
});

// ═══════════════════════════════════════════════════════════════════
// PRODUCTION INCENTIVE (ORA-9)
// ═══════════════════════════════════════════════════════════════════

export const createIncentiveConfigSchema = z.object({
  name: z.string().min(1),
  incentiveBasis: z.enum(['COMPONENT_WISE', 'MODEL_WISE', 'FINISH_PART_WISE']),
  calculationCycle: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  slabs: z.array(z.object({ minOutput: z.number(), maxOutput: z.number(), amount: z.number() })).min(1),
  machineId: z.string().optional(),
  departmentId: z.string().optional(),
});

export const updateIncentiveConfigSchema = createIncentiveConfigSchema.partial();

export const computeIncentivesSchema = z.object({
  period: z.string().min(1),
  records: z.array(z.object({ employeeId: z.string().min(1), outputUnits: z.number().min(0) })).min(1),
});

export const mergeIncentivesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
  payrollRunId: z.string().min(1),
});
