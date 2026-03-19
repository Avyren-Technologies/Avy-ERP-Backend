import { z } from 'zod';

// ── Department ─────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  parentId: z.string().optional(),
  headEmployeeId: z.string().optional(),
  costCentreCode: z.string().optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

// ── Designation ────────────────────────────────────────────────────

export const createDesignationSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  departmentId: z.string().optional(),
  gradeId: z.string().optional(),
  jobLevel: z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']).optional(),
  managerialFlag: z.boolean().default(false),
  reportsTo: z.string().optional(),
  probationDays: z.number().int().positive().optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const updateDesignationSchema = createDesignationSchema.partial();

// ── Grade ──────────────────────────────────────────────────────────

export const createGradeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  ctcMin: z.number().positive().optional(),
  ctcMax: z.number().positive().optional(),
  hraPercent: z.number().min(0).max(100).optional(),
  pfTier: z.enum(['Applicable', 'Not Applicable', 'Optional']).optional(),
  benefitFlags: z.record(z.boolean()).optional(),
  probationMonths: z.number().int().positive().optional(),
  noticeDays: z.number().int().positive().optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const updateGradeSchema = createGradeSchema.partial();

// ── Employee Type ──────────────────────────────────────────────────

export const createEmployeeTypeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  pfApplicable: z.boolean(),
  esiApplicable: z.boolean(),
  ptApplicable: z.boolean(),
  gratuityEligible: z.boolean(),
  bonusEligible: z.boolean(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const updateEmployeeTypeSchema = createEmployeeTypeSchema.partial();

// ── Cost Centre ────────────────────────────────────────────────────

export const createCostCentreSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  annualBudget: z.number().positive().optional(),
  glAccountCode: z.string().optional(),
});

export const updateCostCentreSchema = createCostCentreSchema.partial();
