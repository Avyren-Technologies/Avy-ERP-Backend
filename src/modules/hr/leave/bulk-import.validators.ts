import { z } from 'zod';

// ── Excel Column Mapping ────────────────────────────────────────────

export interface ExcelColumnMapping {
  header: string;
  key: string;
  required: boolean;
}

export const EXCEL_COLUMN_MAP: ExcelColumnMapping[] = [
  { header: 'Employee ID', key: 'employeeId', required: true },
  { header: 'Leave Type Code', key: 'leaveTypeCode', required: true },
  { header: 'Year', key: 'year', required: true },
  { header: 'Opening Balance', key: 'openingBalance', required: false },
  { header: 'Accrued', key: 'accrued', required: false },
  { header: 'Taken', key: 'taken', required: false },
  { header: 'Adjusted', key: 'adjusted', required: false },
];

// ── Row Validation Schema ───────────────────────────────────────────

export const bulkBalanceRowSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  leaveTypeCode: z.string().min(1, 'Leave Type Code is required'),
  year: z.number().int().min(2000, 'Year must be >= 2000').max(2099, 'Year must be <= 2099'),
  openingBalance: z.number().min(0, 'Opening Balance must be >= 0').default(0),
  accrued: z.number().min(0, 'Accrued must be >= 0').default(0),
  taken: z.number().min(0, 'Taken must be >= 0').default(0),
  adjusted: z.number().default(0),
});

export type BulkBalanceRow = z.infer<typeof bulkBalanceRowSchema>;

// ── Endpoint Body Schemas ───────────────────────────────────────────

/** Body for the actual import endpoint (validated rows) */
export const bulkBalanceImportBodySchema = z.object({
  rows: z.array(z.record(z.any())).min(1, 'At least one row is required'),
});
