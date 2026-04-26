import { z } from 'zod';

export const updateVmsConfigSchema = z.object({
  preRegistrationEnabled: z.boolean().optional(),
  qrSelfRegistrationEnabled: z.boolean().optional(),
  walkInAllowed: z.boolean().optional(),
  photoCapture: z.enum(['ALWAYS', 'PER_VISITOR_TYPE', 'NEVER']).optional(),
  idVerification: z.enum(['ALWAYS', 'PER_VISITOR_TYPE', 'NEVER']).optional(),
  safetyInduction: z.enum(['ALWAYS', 'PER_VISITOR_TYPE', 'NEVER']).optional(),
  ndaRequired: z.enum(['ALWAYS', 'PER_VISITOR_TYPE', 'NEVER']).optional(),
  ndaTemplateContent: z.string().max(10000).nullable().optional(),
  badgePrintingEnabled: z.boolean().optional(),
  digitalBadgeEnabled: z.boolean().optional(),
  walkInApprovalRequired: z.boolean().optional(),
  qrSelfRegApprovalRequired: z.boolean().optional(),
  approvalTimeoutMinutes: z.number().int().min(1).max(120).optional(),
  autoRejectAfterMinutes: z.number().int().min(5).max(120).optional(),
  overstayAlertEnabled: z.boolean().optional(),
  defaultMaxDurationMinutes: z.number().int().min(30).max(1440).optional(),
  autoCheckOutEnabled: z.boolean().optional(),
  autoCheckOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  vehicleGatePassEnabled: z.boolean().optional(),
  materialGatePassEnabled: z.boolean().optional(),
  recurringPassEnabled: z.boolean().optional(),
  groupVisitEnabled: z.boolean().optional(),
  emergencyMusterEnabled: z.boolean().optional(),
  privacyConsentText: z.string().max(5000).nullable().optional(),
  checkInStepsOrder: z.array(z.string()).nullable().optional(),
});
// Note: NOT strict — frontend may send extra fields (id, companyId, timestamps)
// that are stripped in the controller before passing to the service.
