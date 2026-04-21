import { z } from 'zod';

// ── Salary Components ─────────────────────────────────────────────────

export const createSalaryComponentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  type: z.enum(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']),
  calculationMethod: z.enum(['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS', 'FORMULA']).default('FIXED'),
  formula: z.string().optional(),
  formulaValue: z.number().optional(),
  taxable: z.enum(['FULLY_TAXABLE', 'PARTIALLY_EXEMPT', 'FULLY_EXEMPT']).default('FULLY_TAXABLE'),
  exemptionSection: z.string().optional(),
  exemptionLimit: z.number().optional(),
  pfInclusion: z.boolean().default(false),
  esiInclusion: z.boolean().default(false),
  bonusInclusion: z.boolean().default(false),
  gratuityInclusion: z.boolean().default(false),
  showOnPayslip: z.boolean().default(true),
  payslipOrder: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

export const updateSalaryComponentSchema = createSalaryComponentSchema.partial();

// ── Salary Structures ─────────────────────────────────────────────────

const structureComponentSchema = z.object({
  componentId: z.string().min(1, 'Component ID is required'),
  calculationMethod: z.enum(['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS', 'FORMULA']),
  value: z.number().optional(),
  formula: z.string().optional(),
});

export const createSalaryStructureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  applicableGradeIds: z.array(z.string()).optional(),
  applicableDesignationIds: z.array(z.string()).optional(),
  applicableTypeIds: z.array(z.string()).optional(),
  components: z.array(structureComponentSchema).min(1, 'At least one component is required'),
  ctcBasis: z.enum(['CTC', 'TAKE_HOME']).default('CTC'),
  isActive: z.boolean().default(true),
});

export const updateSalaryStructureSchema = createSalaryStructureSchema.partial();

// ── Employee Salary ───────────────────────────────────────────────────

export const createEmployeeSalarySchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  structureId: z.string().optional(),
  annualCtc: z.number().positive('Annual CTC must be positive'),
  components: z.record(z.number()).optional(), // { componentCode: amount }
  effectiveFrom: z.string().min(1, 'Effective from date is required'), // ISO date
});

export const updateEmployeeSalarySchema = z.object({
  annualCtc: z.number().positive('Annual CTC must be positive').optional(),
  components: z.record(z.number()).optional(),
  effectiveFrom: z.string().optional(),
  structureId: z.string().optional(),
});

// ── PF Config ─────────────────────────────────────────────────────────

export const pfConfigSchema = z.object({
  employeeRate: z.coerce.number().min(0).max(100).optional(),
  employerEpfRate: z.coerce.number().min(0).max(100).optional(),
  employerEpsRate: z.coerce.number().min(0).max(100).optional(),
  employerEdliRate: z.coerce.number().min(0).max(100).optional(),
  adminChargeRate: z.coerce.number().min(0).max(100).optional(),
  wageCeiling: z.coerce.number().min(0).optional(),
  vpfEnabled: z.boolean().optional(),
  vpfMaxRate: z.coerce.number().min(0).max(100).nullable().optional(),
  excludedComponents: z.array(z.string()).nullish().transform((v) => v || []),
});

// ── ESI Config ────────────────────────────────────────────────────────

export const esiConfigSchema = z.object({
  employeeRate: z.coerce.number().min(0).max(100).optional(),
  employerRate: z.coerce.number().min(0).max(100).optional(),
  wageCeiling: z.coerce.number().min(0).optional(),
  excludedWages: z.array(z.string()).nullish().transform((v) => v || []),
});

// ── PT Config ─────────────────────────────────────────────────────────

const ptSlabSchema = z.object({
  fromAmount: z.coerce.number().min(0),
  toAmount: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0),
});

export const createPTConfigSchema = z.object({
  state: z.string().min(1, 'State is required'),
  slabs: z.array(ptSlabSchema).min(1, 'At least one slab is required'),
  monthlyOverrides: z.record(z.string(), z.coerce.number().min(0)).nullish().transform((v) => v || {}), // { "2": 300 } — month number to override amount
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Financial year must be in format YYYY-YY (e.g. 2025-26)').optional(),
  frequency: z.enum(['MONTHLY', 'SEMI_ANNUAL']).default('MONTHLY'),
  registrationNumber: z.string().optional(),
});

export const updatePTConfigSchema = createPTConfigSchema.partial();

// ── Gratuity Config ───────────────────────────────────────────────────

export const gratuityConfigSchema = z.object({
  formula: z.string().optional(),
  baseSalary: z.string().optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  provisionMethod: z.enum(['MONTHLY', 'ACTUAL_AT_EXIT']).optional(),
  trustExists: z.boolean().optional(),
});

// ── Bonus Config ──────────────────────────────────────────────────────

export const bonusConfigSchema = z.object({
  wageCeiling: z.coerce.number().min(0).optional(),
  minBonusPercent: z.coerce.number().min(0).max(100).optional(),
  maxBonusPercent: z.coerce.number().min(0).max(100).optional(),
  eligibilityDays: z.coerce.number().int().min(0).optional(),
  calculationPeriod: z.enum(['APR_MAR', 'JAN_DEC']).optional(),
});

// ── LWF Config ────────────────────────────────────────────────────────

export const createLWFConfigSchema = z.object({
  state: z.string().min(1, 'State is required'),
  employeeAmount: z.coerce.number().min(0, 'Employee amount is required'),
  employerAmount: z.coerce.number().min(0, 'Employer amount is required'),
  frequency: z.enum(['MONTHLY', 'SEMI_ANNUAL', 'ANNUAL']).default('MONTHLY'),
});

export const updateLWFConfigSchema = createLWFConfigSchema.partial();

// ── Bank Config ───────────────────────────────────────────────────────

export const bankConfigSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required').optional(),
  accountNumber: z.string().min(1, 'Account number is required').optional(),
  ifscCode: z.string().min(1, 'IFSC code is required').optional(),
  branchName: z.string().optional(),
  paymentMode: z.enum(['NEFT', 'RTGS', 'IMPS']).optional(),
  fileFormat: z.string().optional(),
  autoPushOnApproval: z.boolean().optional(),
});

// For initial creation all required fields must be present
export const createBankConfigSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  ifscCode: z.string().min(1, 'IFSC code is required'),
  branchName: z.string().optional(),
  paymentMode: z.enum(['NEFT', 'RTGS', 'IMPS']).default('NEFT'),
  fileFormat: z.string().optional(),
  autoPushOnApproval: z.boolean().default(false),
});


// ── Loan Policy ───────────────────────────────────────────────────────

export const createLoanPolicySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  maxAmount: z.number().positive().optional(),
  maxTenureMonths: z.number().int().positive().optional(),
  interestRate: z.number().min(0).max(100).default(0),
  emiCapPercent: z.number().min(0).max(100).optional(),
  eligibilityTenureDays: z.number().int().min(0).optional(),
  eligibleTypeIds: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});

export const updateLoanPolicySchema = createLoanPolicySchema.partial();

// ── Loan Record ───────────────────────────────────────────────────────

export const createLoanRecordSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  policyId: z.string().min(1, 'Policy ID is required'),
  amount: z.number().positive('Loan amount must be positive'),
  tenure: z.number().int().positive('Tenure must be positive'),
  emiAmount: z.number().positive().optional(), // auto-calculated if not provided
  interestRate: z.number().min(0).max(100).optional(), // defaults from policy
});

export const updateLoanRecordSchema = z.object({
  amount: z.number().positive().optional(),
  tenure: z.number().int().positive().optional(),
  emiAmount: z.number().positive().optional(),
  interestRate: z.number().min(0).max(100).optional(),
});

export const updateLoanStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'ACTIVE', 'CLOSED', 'REJECTED']),
  approvedBy: z.string().optional(),
});

// ── Travel Advance ────────────────────────────────────────────────────

export const createTravelAdvanceSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  tripPurpose: z.string().min(1).max(500),
  estimatedTripDate: z.string().optional(),
});

export const settleTravelAdvanceSchema = z.object({
  expenseClaimId: z.string().min(1, 'Expense claim ID is required'),
});

// ── Tax Config ────────────────────────────────────────────────────────

const taxSlabSchema = z.object({
  fromAmount: z.coerce.number().min(0),
  toAmount: z.coerce.number().min(0).nullable(), // null = no upper limit (top slab)
  rate: z.coerce.number().min(0).max(100),
});

const surchargeRateSchema = z.object({
  threshold: z.coerce.number().min(0),
  rate: z.coerce.number().min(0).max(100),
});

export const taxConfigSchema = z.object({
  defaultRegime: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(['OLD', 'NEW'])).optional(),
  oldRegimeSlabs: z.array(taxSlabSchema).optional(),
  newRegimeSlabs: z.array(taxSlabSchema).optional(),
  declarationDeadline: z.string().optional(), // ISO date
  surchargeRates: z.array(surchargeRateSchema).optional(),
  cessRate: z.coerce.number().min(0).max(100).optional(),
});
