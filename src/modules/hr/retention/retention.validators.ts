import { z } from 'zod';

export const upsertPolicySchema = z.object({
  dataCategory: z.enum([
    'EMPLOYEE_MASTER',
    'PAYROLL',
    'STATUTORY',
    'ATTENDANCE',
    'LEAVE',
    'RECRUITMENT',
    'TRAINING',
    'DISCIPLINE',
    'DOCUMENTS',
    'AUDIT_LOG',
  ]),
  retentionYears: z.number().int().min(1).max(99),
  actionAfter: z.enum(['ARCHIVE', 'DELETE', 'ANONYMISE']).default('ARCHIVE'),
});

export const createDataAccessRequestSchema = z.object({
  requestType: z.enum(['ACCESS', 'RECTIFICATION', 'PORTABILITY', 'ERASURE']),
  description: z.string().max(1000).optional(),
});

export const processDataAccessRequestSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'REJECTED']),
  responseUrl: z.string().optional(),
});

export const recordConsentSchema = z.object({
  employeeId: z.string().min(1),
  consentType: z.enum(['DATA_PROCESSING', 'BIOMETRIC_COLLECTION', 'COMMUNICATION', 'MARKETING']),
  granted: z.boolean(),
  ipAddress: z.string().optional(),
});
