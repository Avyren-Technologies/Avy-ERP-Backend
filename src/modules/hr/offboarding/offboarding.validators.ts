import { z } from 'zod';

// ── Exit Request ────────────────────────────────────────────────────

export const createExitRequestSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  separationType: z.enum([
    'VOLUNTARY_RESIGNATION',
    'RETIREMENT',
    'TERMINATION_FOR_CAUSE',
    'LAYOFF_RETRENCHMENT',
    'DEATH',
    'ABSCONDING',
    'CONTRACT_END',
  ]),
  resignationDate: z.string().optional(),
  noticePeriodWaiver: z.boolean().optional().default(false),
  exitInterviewNotes: z.string().optional(),
});

export const updateExitRequestSchema = z.object({
  lastWorkingDate: z.string().optional(),
  noticePeriodWaiver: z.boolean().optional(),
  waiverAmount: z.number().min(0).optional(),
  exitInterviewDone: z.boolean().optional(),
  exitInterviewNotes: z.string().optional(),
  knowledgeTransferDone: z.boolean().optional(),
  status: z.enum([
    'INITIATED',
    'NOTICE_PERIOD',
    'CLEARANCE_PENDING',
    'CLEARANCE_DONE',
    'FNF_COMPUTED',
    'FNF_PAID',
    'COMPLETED',
  ]).optional(),
});

// ── Exit Clearance ──────────────────────────────────────────────────

export const createClearanceSchema = z.object({
  department: z.string().min(1, 'Department is required'),
  items: z.array(z.object({
    item: z.string().min(1),
    status: z.enum(['PENDING', 'CLEARED', 'NOT_APPLICABLE']).optional().default('PENDING'),
    notes: z.string().optional(),
  })),
});

export const updateClearanceSchema = z.object({
  status: z.enum(['PENDING', 'CLEARED', 'NOT_APPLICABLE']),
  clearedBy: z.string().optional(),
  items: z.array(z.object({
    item: z.string().min(1),
    status: z.enum(['PENDING', 'CLEARED', 'NOT_APPLICABLE']),
    notes: z.string().optional(),
  })).optional(),
});

// ── Exit Interview ──────────────────────────────────────────────────

export const exitInterviewSchema = z.object({
  responses: z.array(z.object({
    question: z.string().min(1, 'Question is required'),
    answer: z.string().min(1, 'Answer is required'),
  })).min(1, 'At least one response is required'),
  conductedBy: z.string().optional(),
  overallRating: z.number().int().min(1).max(5).optional(),
  wouldRecommend: z.boolean().optional(),
});

// ── F&F Settlement ──────────────────────────────────────────────────

export const computeFnFSchema = z.object({
  otherEarnings: z.number().min(0).optional().default(0),
  otherDeductions: z.number().min(0).optional().default(0),
});

export const approveFnFSchema = z.object({
  approvedBy: z.string().min(1, 'Approver user ID is required'),
});
