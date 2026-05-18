import { z } from 'zod';

// ── Shared sub-schemas ──────────────────────────────────────────────

const slabTierSchema = z.object({
  fromQty: z.number().int().nonnegative('fromQty must be non-negative'),
  toQty: z.number().int().positive('toQty must be positive').nullable(),
  ratePerPiece: z.number().positive('ratePerPiece must be positive'),
});

// ── Slab Config ─────────────────────────────────────────────────────

export const createSlabConfigSchema = z.object({
  machineId: z.string().min(1, 'Machine ID is required'),
  operationId: z.string().min(1, 'Operation ID is required'),
  partId: z.string().min(1, 'Part ID is required'),
  shiftTargetQty: z.number().int().positive('Shift target qty must be a positive integer'),
  slabTiers: z.array(slabTierSchema).min(1, 'At least one slab tier is required'),
  locationId: z.string().optional(),
});

export type CreateSlabConfigInput = z.infer<typeof createSlabConfigSchema>;

export const bulkCreateSlabConfigSchema = z.object({
  machineIds: z.array(z.string().min(1)).min(1, 'At least one machine ID is required'),
  operationIds: z.array(z.string().min(1)).min(1, 'At least one operation ID is required'),
  configs: z.array(
    z.object({
      partId: z.string().min(1, 'Part ID is required'),
      shiftTargetQty: z.number().int().positive('Shift target qty must be a positive integer'),
      slabTiers: z.array(slabTierSchema).min(1, 'At least one slab tier is required'),
    }),
  ).min(1, 'At least one config is required'),
  locationId: z.string().optional(),
});

export type BulkCreateSlabConfigInput = z.infer<typeof bulkCreateSlabConfigSchema>;

export const updateSlabConfigSchema = z.object({
  shiftTargetQty: z.number().int().positive('Shift target qty must be a positive integer').optional(),
  slabTiers: z.array(slabTierSchema).min(1, 'At least one slab tier is required').optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSlabConfigInput = z.infer<typeof updateSlabConfigSchema>;

// ── Daily Entry ─────────────────────────────────────────────────────

export const saveDailyEntriesSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry date must be YYYY-MM-DD format'),
  shiftId: z.string().min(1, 'Shift ID is required'),
  operatorId: z.string().min(1, 'Operator ID is required'),
  locationId: z.string().optional(),
  entries: z.array(
    z.object({
      machineId: z.string().min(1, 'Machine ID is required'),
      partId: z.string().min(1, 'Part ID is required'),
      operationId: z.string().optional(),
      slabConfigId: z.string().optional(),
      qtyProduced: z.number().int().nonnegative('Qty produced must be non-negative'),
      ncCount: z.number().int().nonnegative('NC count must be non-negative').optional(),
      ncReason: z.string().optional(),
    }),
  ).min(1, 'At least one entry is required'),
});

export type SaveDailyEntriesInput = z.infer<typeof saveDailyEntriesSchema>;

// ── Calculator Simulation ───────────────────────────────────────────

export const simulateIncentiveSchema = z.object({
  // Accept simple format (partId + qtyProduced) — service resolves slab config
  parts: z.array(
    z.object({
      partId: z.string().min(1, 'Part ID is required'),
      qtyProduced: z.number().nonnegative('Qty produced must be non-negative'),
    }),
  ).min(1, 'At least one part is required'),
  methodNumber: z.union([z.literal(1), z.literal(2)]).optional(),
});

export type SimulateIncentiveInput = z.infer<typeof simulateIncentiveSchema>;

// ── Incentive Config ────────────────────────────────────────────────

export const updateIncentiveConfigSchema = z.object({
  method1Enabled: z.boolean().optional(),
  method1Name: z.string().min(1, 'Method 1 name cannot be empty').optional(),
  method2Enabled: z.boolean().optional(),
  method2Name: z.string().min(1, 'Method 2 name cannot be empty').optional(),
});

export type UpdateIncentiveConfigInput = z.infer<typeof updateIncentiveConfigSchema>;

// ── Monthly Report ──────────────────────────────────────────────────

export const generateMonthlyReportSchema = z.object({
  month: z.number().int().min(1, 'Month must be 1-12').max(12, 'Month must be 1-12'),
  year: z.number().int().min(2020, 'Year must be 2020-2099').max(2099, 'Year must be 2020-2099'),
  locationId: z.string().optional(),
});

export type GenerateMonthlyReportInput = z.infer<typeof generateMonthlyReportSchema>;

export const mergeToPayrollSchema = z.object({
  payrollRunId: z.string().min(1, 'Payroll run ID is required'),
});

export type MergeToPayrollInput = z.infer<typeof mergeToPayrollSchema>;

// ── Operations ─────────────────────────────────────────────────────

const ProcessTypeEnum = z.enum(['MACHINING', 'MOULDING', 'ASSEMBLY', 'INSPECTION', 'FINISHING', 'PACKAGING']);
const OperationStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

export const createOperationSchema = z.object({
  operationNumber: z.string().min(1, 'Operation number is required'),
  name: z.string().min(1, 'Operation name is required'),
  processType: ProcessTypeEnum.optional(),
  status: OperationStatusEnum.optional(),
});
export type CreateOperationInput = z.infer<typeof createOperationSchema>;

export const updateOperationSchema = z.object({
  operationNumber: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  processType: ProcessTypeEnum.optional(),
  status: OperationStatusEnum.optional(),
});
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;

export const listOperationsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  processType: ProcessTypeEnum.optional(),
  status: OperationStatusEnum.optional(),
});
export type ListOperationsInput = z.infer<typeof listOperationsSchema>;

// ── List Filters ────────────────────────────────────────────────────

export const listSlabConfigsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  machineId: z.string().optional(),
  operationId: z.string().optional(),
  partId: z.string().optional(),
  locationId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const listDailyEntriesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry date must be YYYY-MM-DD format').optional(),
  shiftId: z.string().optional(),
  operatorId: z.string().optional(),
  machineId: z.string().optional(),
  partId: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED']).optional(),
  locationId: z.string().optional(),
});

export const listMonthlyReportsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED']).optional(),
  locationId: z.string().optional(),
  year: z.coerce.number().int().optional(),
});
