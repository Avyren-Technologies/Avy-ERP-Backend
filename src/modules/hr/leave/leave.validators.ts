import { z } from 'zod';

// ── Leave Type ────────────────────────────────────────────────────────

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(10),
  category: z.enum(['PAID', 'UNPAID', 'COMPENSATORY', 'STATUTORY']),
  annualEntitlement: z.number().positive(),
  accrualFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'PRO_RATA', 'UPFRONT']).optional(),
  accrualDay: z.number().int().min(1).max(31).optional(),
  carryForwardAllowed: z.boolean().default(false),
  maxCarryForwardDays: z.number().min(0).optional(),
  encashmentAllowed: z.boolean().default(false),
  maxEncashableDays: z.number().min(0).optional(),
  encashmentRate: z.string().optional(),
  applicableTypeIds: z.array(z.string()).optional(),
  applicableGender: z.string().optional(),
  probationRestricted: z.boolean().default(false),
  minTenureDays: z.number().int().min(0).optional(),
  minAdvanceNotice: z.number().int().min(0).optional(),
  minDaysPerApplication: z.number().min(0).optional(),
  maxConsecutiveDays: z.number().int().min(1).optional(),
  allowHalfDay: z.boolean().default(true),
  weekendSandwich: z.boolean().default(false),
  holidaySandwich: z.boolean().default(false),
  documentRequired: z.boolean().default(false),
  documentAfterDays: z.number().int().min(1).optional(),
  lopOnExcess: z.boolean().default(true),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

// ── Leave Policy ──────────────────────────────────────────────────────

export const createLeavePolicySchema = z.object({
  leaveTypeId: z.string().min(1),
  assignmentLevel: z.enum(['company', 'department', 'designation', 'grade', 'employeeType', 'individual']),
  assignmentId: z.string().optional(),
  overrides: z.record(z.any()).optional(),
});

export const updateLeavePolicySchema = createLeavePolicySchema.partial();

// ── Leave Balance Adjust ──────────────────────────────────────────────

export const adjustBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  action: z.enum(['credit', 'debit']),
  days: z.number().positive(),
  reason: z.string().min(1).max(500),
});

// ── Leave Balance Initialize ──────────────────────────────────────────

export const initializeBalancesSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});

// ── Leave Request ─────────────────────────────────────────────────────

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  fromDate: z.string().min(1), // ISO date string
  toDate: z.string().min(1),
  days: z.number().positive(),
  isHalfDay: z.boolean().default(false),
  halfDayType: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  reason: z.string().min(1).max(1000),
});

// ── Approve / Reject ──────────────────────────────────────────────────

export const approveRequestSchema = z.object({
  note: z.string().max(500).optional(),
});

export const rejectRequestSchema = z.object({
  note: z.string().min(1).max(500),
});

// ── Accrual & Carry-Forward ──────────────────────────────────────────

export const accrueBalancesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export const carryForwardSchema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  toYear: z.number().int().min(2000).max(2100),
});

// ── Partial Cancellation ─────────────────────────────────────────────

export const partialCancelRequestSchema = z.object({
  cancelFromDate: z.string().min(1), // ISO date string
});
