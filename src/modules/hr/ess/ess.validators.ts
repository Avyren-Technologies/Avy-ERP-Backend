import { z } from 'zod';

// ── ESS Config ──────────────────────────────────────────────────────

export const essConfigSchema = z.object({
  viewPayslips: z.boolean().optional(),
  downloadForm16: z.boolean().optional(),
  leaveApplication: z.boolean().optional(),
  leaveBalanceView: z.boolean().optional(),
  itDeclaration: z.boolean().optional(),
  attendanceView: z.boolean().optional(),
  attendanceRegularization: z.boolean().optional(),
  reimbursementClaims: z.boolean().optional(),
  profileUpdate: z.boolean().optional(),
  documentUpload: z.boolean().optional(),
  loanApplication: z.boolean().optional(),
  assetView: z.boolean().optional(),
  performanceGoals: z.boolean().optional(),
  appraisalAccess: z.boolean().optional(),
  feedback360: z.boolean().optional(),
  trainingEnrollment: z.boolean().optional(),
  helpDesk: z.boolean().optional(),
  employeeDirectory: z.boolean().optional(),
  holidayCalendar: z.boolean().optional(),
  policyDocuments: z.boolean().optional(),
  grievanceSubmission: z.boolean().optional(),
  loginMethod: z.enum(['PASSWORD', 'SSO', 'OTP']).optional(),
  passwordMinLength: z.number().int().min(6).max(32).optional(),
  passwordComplexity: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  mfaRequired: z.boolean().optional(),
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
  section80C: z.any().optional(),
  section80CCD: z.any().optional(),
  section80D: z.any().optional(),
  section80E: z.any().optional(),
  section80G: z.any().optional(),
  section80GG: z.any().optional(),
  section80TTA: z.any().optional(),
  hraExemption: z.any().optional(),
  ltaExemption: z.any().optional(),
  homeLoanInterest: z.any().optional(),
  otherIncome: z.any().optional(),
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
  attendanceRecordId: z.string().min(1, 'Attendance record ID is required'),
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
});

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
