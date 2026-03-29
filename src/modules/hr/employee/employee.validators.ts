import { z } from 'zod';

// ── Shared address schema ─────────────────────────────────────────────
const addressSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pin: z.string().min(1, 'PIN code is required'),
  country: z.string().default('India'),
});

// ── Create Employee (full 6-tab form) ─────────────────────────────────
export const createEmployeeSchema = z.object({
  // Tab 1: Personal
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().or(z.date()),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  bloodGroup: z.string().optional(),
  fatherMotherName: z.string().optional(),
  nationality: z.string().default('Indian'),
  religion: z.string().optional(),
  category: z.string().optional(),
  differentlyAbled: z.boolean().optional(),
  disabilityType: z.string().optional(),
  profilePhotoUrl: z.string().nullable().optional(),

  // Contact Info
  personalMobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  alternativeMobile: z.string().optional(),
  personalEmail: z.string().email('Invalid email address'),
  officialEmail: z.string().email().optional(),
  currentAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  emergencyContactName: z.string().min(1, 'Emergency contact name is required'),
  emergencyContactRelation: z.string().min(1, 'Emergency contact relation is required'),
  emergencyContactMobile: z.string().min(10, 'Emergency contact mobile must be at least 10 digits'),

  // Tab 2: Professional
  joiningDate: z.string().or(z.date()),
  employeeTypeId: z.string().min(1, 'Employee type is required'),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().min(1, 'Designation is required'),
  gradeId: z.string().optional(),
  reportingManagerId: z.string().optional(),
  functionalManagerId: z.string().optional(),
  workType: z.enum(['ON_SITE', 'REMOTE', 'HYBRID']).optional(),
  shiftId: z.string().optional(),
  costCentreId: z.string().optional(),
  locationId: z.string().optional(),
  noticePeriodDays: z.number().int().optional(),

  // Tab 3: Salary
  annualCtc: z.number().positive().optional(),
  salaryStructure: z.record(z.any()).optional(),
  paymentMode: z.enum(['NEFT', 'IMPS', 'CHEQUE']).optional(),

  // Tab 4: Bank
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountType: z.enum(['SAVINGS', 'CURRENT']).optional(),

  // Statutory IDs
  panNumber: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  uan: z.string().optional(),
  esiIpNumber: z.string().optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().or(z.date()).optional(),
  drivingLicence: z.string().optional(),
  voterId: z.string().optional(),
  pran: z.string().optional(),

  // Probation
  probationEndDate: z.string().or(z.date()).nullable().optional(),

  // Optional: initial employee status (defaults to PROBATION)
  initialStatus: z.enum(['ACTIVE', 'PROBATION', 'CONFIRMED']).optional(),

  // Optional: Create a User (login) account simultaneously
  createUserAccount: z.boolean().optional(),
  userPassword: z.string().min(6, 'Password must be at least 6 characters').optional(),
  userRole: z.string().optional(),
  userLocationId: z.string().optional(),

  // Document uploads (base64)
  documentUploads: z.record(z.object({
    fileName: z.string(),
    base64: z.string(),
  })).optional(),
}).passthrough();

// Refined version for create — validates user account fields
export const createEmployeeWithUserSchema = createEmployeeSchema.refine(
  (data) => {
    if (data.createUserAccount && !data.userPassword) return false;
    return true;
  },
  { message: 'Password is required when creating a user account', path: ['userPassword'] },
).refine(
  (data) => {
    if (data.createUserAccount && !data.officialEmail) return false;
    return true;
  },
  { message: 'Official email is required when creating a user account', path: ['officialEmail'] },
);

// ── Update Employee (all fields optional) ─────────────────────────────
export const updateEmployeeSchema = createEmployeeSchema.partial();

// ── Status Update ─────────────────────────────────────────────────────
export const updateEmployeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE', 'SUSPENDED', 'EXITED']),
  lastWorkingDate: z.string().or(z.date()).optional(),
  exitReason: z.string().optional(),
});

// ── Nominee ───────────────────────────────────────────────────────────
export const createNomineeSchema = z.object({
  name: z.string().min(1, 'Nominee name is required'),
  relation: z.string().min(1, 'Relation is required'),
  dateOfBirth: z.string().or(z.date()).optional(),
  sharePercent: z.number().min(0).max(100).optional(),
  aadhaar: z.string().optional(),
  pan: z.string().optional(),
  address: addressSchema.optional(),
});

export const updateNomineeSchema = createNomineeSchema.partial();

// ── Education ─────────────────────────────────────────────────────────
export const createEducationSchema = z.object({
  qualification: z.string().min(1, 'Qualification is required'),
  degree: z.string().optional(),
  institution: z.string().optional(),
  university: z.string().optional(),
  yearOfPassing: z.number().int().optional(),
  marks: z.string().optional(),
  certificateUrl: z.string().optional(),
});

export const updateEducationSchema = createEducationSchema.partial();

// ── Previous Employment ───────────────────────────────────────────────
export const createPrevEmploymentSchema = z.object({
  employerName: z.string().min(1, 'Employer name is required'),
  designation: z.string().optional(),
  lastCtc: z.number().positive().optional(),
  joinDate: z.string().or(z.date()).optional(),
  leaveDate: z.string().or(z.date()).optional(),
  reason: z.string().optional(),
  experienceLetterUrl: z.string().optional(),
  relievingLetterUrl: z.string().optional(),
  previousPfAccount: z.string().optional(),
});

export const updatePrevEmploymentSchema = createPrevEmploymentSchema.partial();

// ── Document ──────────────────────────────────────────────────────────
export const createDocumentSchema = z.object({
  documentType: z.string().min(1, 'Document type is required'),
  documentNumber: z.string().optional(),
  expiryDate: z.string().or(z.date()).optional(),
  fileUrl: z.string().min(1, 'File URL is required'),
  fileName: z.string().optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();
