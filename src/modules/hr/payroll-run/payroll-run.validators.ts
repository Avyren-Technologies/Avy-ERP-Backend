import { z } from 'zod';

// ── Payroll Run ──────────────────────────────────────────────────────

export const createPayrollRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
});

// ── Payroll Entry Override ───────────────────────────────────────────

export const overrideEntrySchema = z.object({
  earnings: z.record(z.number()).optional(),
  deductions: z.record(z.number()).optional(),
  exceptionNote: z.string().optional(),
});

// ── Salary Hold ─────────────────────────────────────────────────────

export const createSalaryHoldSchema = z.object({
  payrollRunId: z.string().min(1, 'Payroll run ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  holdType: z.enum(['FULL', 'PARTIAL']).default('FULL'),
  reason: z.string().min(1, 'Reason is required'),
  heldComponents: z.array(z.string()).optional(), // component codes for PARTIAL hold
});

// ── Salary Revision ─────────────────────────────────────────────────

export const createSalaryRevisionSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  newCtc: z.number().positive('New CTC must be positive'),
  effectiveDate: z.string().min(1, 'Effective date is required'), // ISO date
  incrementPercent: z.number().min(0).max(1000).optional(),
  newComponents: z.record(z.number()).optional(), // new breakup
});

// ── Statutory Filing ────────────────────────────────────────────────

export const createStatutoryFilingSchema = z.object({
  type: z.enum([
    'PF_ECR',
    'ESI_CHALLAN',
    'PT_CHALLAN',
    'TDS_24Q',
    'FORM_16',
    'BONUS_STATEMENT',
    'GRATUITY_REGISTER',
    'LWF_STATEMENT',
  ]),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).max(2099),
  amount: z.number().min(0).optional(),
  dueDate: z.string().optional(), // ISO date
  details: z.record(z.any()).optional(),
});

export const updateStatutoryFilingSchema = z.object({
  status: z.enum(['PENDING', 'GENERATED', 'FILED', 'VERIFIED']).optional(),
  amount: z.number().min(0).optional(),
  fileUrl: z.string().optional(),
  filedAt: z.string().optional(), // ISO date
  filedBy: z.string().optional(),
  details: z.record(z.any()).optional(),
});

// ── RED-4: Form 16 & 24Q ───────────────────────────────────────────

export const generateForm16Schema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-YY (e.g., 2025-26)'),
});

export const generateForm24QSchema = z.object({
  quarter: z.number().int().min(1).max(4),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-YY'),
});

// ── ORA-5: Bulk Salary Revisions ───────────────────────────────────

export const bulkCreateSalaryRevisionsSchema = z.object({
  revisions: z.array(
    z.object({
      employeeId: z.string().min(1, 'Employee ID is required'),
      newCtc: z.number().positive('New CTC must be positive'),
      effectiveDate: z.string().min(1, 'Effective date is required'),
      incrementPercent: z.number().min(0).max(1000).optional(),
      newComponents: z.record(z.number()).optional(),
    })
  ).min(1, 'At least one revision is required'),
});
