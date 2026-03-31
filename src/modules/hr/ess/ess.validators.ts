import { z } from 'zod';
import { LocationAccuracy } from '@prisma/client';

// ── ESS Config (36 fields — spec Screen 6) ──────────────────────────

export const essConfigSchema = z.object({
  // Payroll & Tax
  viewPayslips: z.boolean().optional(),
  downloadPayslips: z.boolean().optional(),
  downloadForm16: z.boolean().optional(),
  viewSalaryStructure: z.boolean().optional(),
  itDeclaration: z.boolean().optional(),

  // Leave
  leaveApplication: z.boolean().optional(),
  leaveBalanceView: z.boolean().optional(),
  leaveCancellation: z.boolean().optional(),

  // Attendance
  attendanceView: z.boolean().optional(),
  attendanceRegularization: z.boolean().optional(),
  viewShiftSchedule: z.boolean().optional(),
  shiftSwapRequest: z.boolean().optional(),
  wfhRequest: z.boolean().optional(),

  // Profile & Documents
  profileUpdate: z.boolean().optional(),
  documentUpload: z.boolean().optional(),
  employeeDirectory: z.boolean().optional(),
  viewOrgChart: z.boolean().optional(),

  // Financial
  reimbursementClaims: z.boolean().optional(),
  loanApplication: z.boolean().optional(),
  assetView: z.boolean().optional(),

  // Performance & Development
  performanceGoals: z.boolean().optional(),
  appraisalAccess: z.boolean().optional(),
  feedback360: z.boolean().optional(),
  trainingEnrollment: z.boolean().optional(),

  // Support & Communication
  helpDesk: z.boolean().optional(),
  grievanceSubmission: z.boolean().optional(),
  holidayCalendar: z.boolean().optional(),
  policyDocuments: z.boolean().optional(),
  announcementBoard: z.boolean().optional(),

  // Manager Self-Service (MSS)
  mssViewTeam: z.boolean().optional(),
  mssApproveLeave: z.boolean().optional(),
  mssApproveAttendance: z.boolean().optional(),
  mssViewTeamAttendance: z.boolean().optional(),

  // Mobile Behavior
  mobileOfflinePunch: z.boolean().optional(),
  mobileSyncRetryMinutes: z.number().int().min(1).max(60).optional(),
  mobileLocationAccuracy: z.nativeEnum(LocationAccuracy).optional(),
});

// ── Approval Workflows ──────────────────────────────────────────────

const workflowStepSchema = z.object({
  stepOrder: z.number().int().min(1),
  approverRole: z.string().min(1, 'Approver role is required'),
  approverId: z.string().optional(),
  slaHours: z.number().min(1),
  autoEscalate: z.boolean().optional().default(false),
  autoApprove: z.boolean().optional().default(false),
  autoReject: z.boolean().optional().default(false),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  triggerEvent: z.string().min(1, 'Trigger event is required'),
  steps: z.array(workflowStepSchema).min(1, 'At least one step is required'),
  isActive: z.boolean().optional().default(true),
});

export const updateWorkflowSchema = createWorkflowSchema.partial();

// ── Approval Requests ───────────────────────────────────────────────

export const processApprovalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().optional(),
});

// ── Notification Templates ──────────────────────────────────────────

export const createNotificationTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().optional(),
  body: z.string().min(1, 'Template body is required'),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP', 'WHATSAPP']),
  isActive: z.boolean().optional().default(true),
});

export const updateNotificationTemplateSchema = createNotificationTemplateSchema.partial();

// ── Notification Rules ──────────────────────────────────────────────

export const createNotificationRuleSchema = z.object({
  triggerEvent: z.string().min(1, 'Trigger event is required'),
  templateId: z.string().min(1, 'Template ID is required'),
  recipientRole: z.string().min(1, 'Recipient role is required'),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP', 'WHATSAPP']),
  isActive: z.boolean().optional().default(true),
});

export const updateNotificationRuleSchema = createNotificationRuleSchema.partial();

// ── IT Declarations ─────────────────────────────────────────────────

export const createITDeclarationSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  financialYear: z.string().min(1, 'Financial year is required'), // "2025-26"
  regime: z.enum(['OLD', 'NEW']).optional().default('NEW'),
  section80C: z.record(z.string(), z.unknown()).optional(),
  section80CCD: z.record(z.string(), z.unknown()).optional(),
  section80D: z.record(z.string(), z.unknown()).optional(),
  section80E: z.record(z.string(), z.unknown()).optional(),
  section80G: z.record(z.string(), z.unknown()).optional(),
  section80GG: z.record(z.string(), z.unknown()).optional(),
  section80TTA: z.record(z.string(), z.unknown()).optional(),
  hraExemption: z.record(z.string(), z.unknown()).optional(),
  ltaExemption: z.record(z.string(), z.unknown()).optional(),
  homeLoanInterest: z.record(z.string(), z.unknown()).optional(),
  otherIncome: z.record(z.string(), z.unknown()).optional(),
});

export const updateITDeclarationSchema = createITDeclarationSchema.partial().omit({
  employeeId: true,
  financialYear: true,
});

// ── Manager Delegates ───────────────────────────────────────────────

export const createDelegateSchema = z.object({
  managerId: z.string().min(1, 'Manager ID is required'),
  delegateId: z.string().min(1, 'Delegate ID is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  reason: z.string().optional(),
});

// ── Expense Claims (ESS) ───────────────────────────────────────────

export const essExpenseClaimSchema = z.object({
  title: z.string().min(1),
  amount: z.number().positive(),
  category: z.enum(['TRAVEL', 'MEDICAL', 'INTERNET', 'FUEL', 'UNIFORM', 'BUSINESS', 'OTHER']),
  description: z.string().optional(),
  tripDate: z.string().optional(),
  receipts: z.array(z.object({ fileName: z.string(), fileUrl: z.string() })).optional(),
});

// ── Loan Application (ESS) ────────────────────────────────────────

export const essLoanApplicationSchema = z.object({
  policyId: z.string().min(1),
  amount: z.number().positive(),
  tenure: z.number().int().min(1),
  reason: z.string().optional(),
});

// ── ESS Self-Service ────────────────────────────────────────────────

export const applyLeaveSchema = z.object({
  leaveTypeId: z.string().min(1, 'Leave type ID is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  days: z.number().min(0.5),
  isHalfDay: z.boolean().optional().default(false),
  halfDayType: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  reason: z.string().min(1, 'Reason is required'),
});

export const regularizeAttendanceSchema = z.object({
  attendanceRecordId: z.string().optional(), // Optional — if absent, use date to auto-create record
  date: z.string().optional(),               // ISO date — used when no record exists (absent day)
  issueType: z.enum([
    'MISSING_PUNCH_IN',
    'MISSING_PUNCH_OUT',
    'ABSENT_OVERRIDE',
    'LATE_OVERRIDE',
    'NO_PUNCH',
  ]),
  correctedPunchIn: z.string().optional(),
  correctedPunchOut: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
}).refine(
  (data) => data.attendanceRecordId || data.date,
  { message: 'Either attendanceRecordId or date is required', path: ['attendanceRecordId'] }
);

// ── Shift Check-In / Check-Out ──────────────────────────────────────

export const checkInSchema = z.object({
  shiftId: z.string().optional(),
  locationId: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  photoUrl: z.string().optional(),
});

export const checkOutSchema = z.object({
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  photoUrl: z.string().optional(),
});

// ── Profile Update (ESS self-service) ──────────────────────────────

// ── File Grievance ────────────────────────────────────────────────

export const fileGrievanceSchema = z.object({
  categoryId: z.string().min(1),
  description: z.string().min(1),
  isAnonymous: z.boolean().optional().default(false),
});

// ── Shift Swap ─────────────────────────────────────────────────────

export const shiftSwapSchema = z.object({
  currentShiftId: z.string().min(1),
  requestedShiftId: z.string().min(1),
  swapDate: z.string().min(1),
  reason: z.string().min(1),
}).refine(data => new Date(data.swapDate) >= new Date(new Date().toDateString()), {
  message: 'Swap date must be today or in the future',
  path: ['swapDate'],
});

// ── WFH Request ────────────────────────────────────────────────────

export const wfhRequestSchema = z.object({
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  days: z.number().min(0.5),
  reason: z.string().min(1),
}).refine(data => new Date(data.fromDate) <= new Date(data.toDate), {
  message: 'From date must be before or equal to to date',
  path: ['toDate'],
});

// ── Employee Document Upload ───────────────────────────────────────

export const uploadDocumentSchema = z.object({
  documentType: z.string().min(1),
  documentNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  fileUrl: z.string().url('Must be a valid URL'),
  fileName: z.string().min(1),
});

// ── Policy Document ────────────────────────────────────────────────

export const policyDocumentSchema = z.object({
  title: z.string().min(1),
  category: z.enum(['HR_POLICY', 'LEAVE_POLICY', 'ATTENDANCE_POLICY', 'CODE_OF_CONDUCT', 'SAFETY', 'TRAVEL', 'IT_POLICY', 'OTHER']),
  description: z.string().optional(),
  fileUrl: z.string().url('Must be a valid URL'),
  fileName: z.string().min(1),
  version: z.string().optional(),
});

// ── Profile Update (ESS self-service) ──────────────────────────────

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  pin: z.string().optional(),
  country: z.string().optional(),
}).optional();

export const updateProfileSchema = z.object({
  personalMobile: z.string().min(1).optional(),
  alternativeMobile: z.string().optional(),
  personalEmail: z.string().email().optional(),
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
  emergencyContactName: z.string().min(1).optional(),
  emergencyContactRelation: z.string().min(1).optional(),
  emergencyContactMobile: z.string().min(1).optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  bloodGroup: z.string().optional(),
});
