import { z } from 'zod';

// ── Enum Maps (Excel human-friendly values → backend enums) ─────────

export const GENDER_MAP: Record<string, string> = {
  male: 'MALE',
  female: 'FEMALE',
  other: 'NON_BINARY',
  'prefer not to say': 'PREFER_NOT_TO_SAY',
};

export const MARITAL_STATUS_MAP: Record<string, string> = {
  single: 'SINGLE',
  married: 'MARRIED',
  divorced: 'DIVORCED',
  widowed: 'WIDOWED',
};

export const WORK_TYPE_MAP: Record<string, string> = {
  on_site: 'ON_SITE',
  'on-site': 'ON_SITE',
  onsite: 'ON_SITE',
  remote: 'REMOTE',
  hybrid: 'HYBRID',
};

export const PAYMENT_MODE_MAP: Record<string, string> = {
  neft: 'NEFT',
  imps: 'IMPS',
  cheque: 'CHEQUE',
};

export const ACCOUNT_TYPE_MAP: Record<string, string> = {
  savings: 'SAVINGS',
  current: 'CURRENT',
};

export const YES_NO_MAP: Record<string, boolean> = {
  yes: true,
  y: true,
  '1': true,
  true: true,
  no: false,
  n: false,
  '0': false,
  false: false,
};

// ── Excel Column Mapping ────────────────────────────────────────────

export interface ExcelColumnMapping {
  header: string;
  key: string;
  required: boolean;
}

export const EXCEL_COLUMN_MAP: ExcelColumnMapping[] = [
  // Personal
  { header: 'First Name', key: 'firstName', required: true },
  { header: 'Middle Name', key: 'middleName', required: false },
  { header: 'Last Name', key: 'lastName', required: true },
  { header: 'Date of Birth', key: 'dateOfBirth', required: false },
  { header: 'Gender', key: 'gender', required: false },
  { header: 'Marital Status', key: 'maritalStatus', required: false },
  { header: 'Blood Group', key: 'bloodGroup', required: false },
  { header: 'Father/Mother Name', key: 'fatherMotherName', required: false },
  { header: 'Nationality', key: 'nationality', required: false },

  // Contact
  { header: 'Personal Mobile', key: 'personalMobile', required: true },
  { header: 'Personal Email', key: 'personalEmail', required: true },
  { header: 'Official Email', key: 'officialEmail', required: false },
  { header: 'Emergency Contact Name', key: 'emergencyContactName', required: true },
  { header: 'Emergency Contact Relation', key: 'emergencyContactRelation', required: true },
  { header: 'Emergency Contact Mobile', key: 'emergencyContactMobile', required: true },

  // Professional
  { header: 'Joining Date', key: 'joiningDate', required: true },
  { header: 'Employee Type Code', key: 'employeeTypeCode', required: true },
  { header: 'Department Code', key: 'departmentCode', required: true },
  { header: 'Designation Code', key: 'designationCode', required: true },
  { header: 'Grade Code', key: 'gradeCode', required: false },
  { header: 'Location Code', key: 'locationCode', required: false },
  { header: 'Shift Name', key: 'shiftName', required: false },
  { header: 'Cost Centre Code', key: 'costCentreCode', required: false },
  { header: 'Reporting Manager EmpID', key: 'reportingManagerEmpId', required: false },
  { header: 'Work Type', key: 'workType', required: false },

  // Salary
  { header: 'Annual CTC', key: 'annualCtc', required: false },
  { header: 'Payment Mode', key: 'paymentMode', required: false },
  { header: 'Salary Structure', key: 'salaryStructureName', required: false },

  // Bank
  { header: 'Bank Account No', key: 'bankAccountNumber', required: false },
  { header: 'Bank IFSC', key: 'bankIfscCode', required: false },
  { header: 'Bank Name', key: 'bankName', required: false },
  { header: 'Account Type', key: 'accountType', required: false },

  // Statutory
  { header: 'PAN', key: 'panNumber', required: false },
  { header: 'Aadhaar', key: 'aadhaarNumber', required: false },
  { header: 'UAN', key: 'uan', required: false },
  { header: 'ESI IP Number', key: 'esiIpNumber', required: false },

  // User account
  { header: 'Create Account', key: 'createAccount', required: false },
  { header: 'Role', key: 'roleName', required: false },
];

// ── Row Validation Schema ───────────────────────────────────────────

export const bulkEmployeeRowSchema = z.object({
  // Personal (required)
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),

  // Personal (optional)
  middleName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  bloodGroup: z.string().optional(),
  fatherMotherName: z.string().optional(),
  nationality: z.string().optional(),

  // Contact (required)
  personalMobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  personalEmail: z.string().email('Invalid personal email'),
  emergencyContactName: z.string().min(1, 'Emergency contact name is required'),
  emergencyContactRelation: z.string().min(1, 'Emergency contact relation is required'),
  emergencyContactMobile: z.string().min(10, 'Emergency contact mobile must be at least 10 digits'),

  // Contact (optional)
  officialEmail: z.string().email('Invalid official email').optional(),

  // Professional (required codes)
  joiningDate: z.string().min(1, 'Joining date is required'),
  employeeTypeCode: z.string().min(1, 'Employee type code is required'),
  departmentCode: z.string().min(1, 'Department code is required'),
  designationCode: z.string().min(1, 'Designation code is required'),

  // Professional (optional)
  gradeCode: z.string().optional(),
  locationCode: z.string().optional(),
  shiftName: z.string().optional(),
  costCentreCode: z.string().optional(),
  reportingManagerEmpId: z.string().optional(),
  workType: z.enum(['ON_SITE', 'REMOTE', 'HYBRID']).optional(),

  // Salary (optional)
  annualCtc: z.number().positive('Annual CTC must be positive').optional(),
  paymentMode: z.enum(['NEFT', 'IMPS', 'CHEQUE']).optional(),
  salaryStructureName: z.string().optional(),

  // Bank (optional)
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  bankName: z.string().optional(),
  accountType: z.enum(['SAVINGS', 'CURRENT']).optional(),

  // Statutory (optional)
  panNumber: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  uan: z.string().optional(),
  esiIpNumber: z.string().optional(),

  // User account
  createAccount: z.boolean().default(true),
  roleName: z.string().optional(),
});

export type BulkEmployeeRow = z.infer<typeof bulkEmployeeRowSchema>;

// ── Endpoint Body Schemas ───────────────────────────────────────────

/** Body for the validate-only endpoint (upload + parse + validate) */
export const bulkValidateBodySchema = z.object({
  defaultPassword: z.string().min(6, 'Default password must be at least 6 characters'),
});

/** Body for the actual import endpoint (validated rows + password) */
export const bulkImportBodySchema = z.object({
  defaultPassword: z.string().min(6, 'Default password must be at least 6 characters'),
  rows: z.array(z.record(z.any())).min(1, 'At least one row is required'),
});
