import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE EDUCATION
// ═══════════════════════════════════════════════════════════════════

export const createEducationSchema = z.object({
  qualification: z.string().min(1, 'Qualification is required'),
  degree: z.string().optional(),
  institution: z.string().optional(),
  university: z.string().optional(),
  yearOfPassing: z.number().int().min(1950).max(2100).optional(),
  percentage: z.number().min(0).max(100).optional(),
  certificateUrl: z.string().optional(),
});

export const updateEducationSchema = createEducationSchema.partial();

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE EXPERIENCE
// ═══════════════════════════════════════════════════════════════════

export const createExperienceSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  designation: z.string().min(1, 'Designation is required'),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  currentlyWorking: z.boolean().optional(),
  ctc: z.number().positive().optional(),
  description: z.string().optional(),
});

export const updateExperienceSchema = createExperienceSchema.partial();

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE DOCUMENT
// ═══════════════════════════════════════════════════════════════════

export const createDocumentSchema = z.object({
  documentType: z.string().min(1, 'Document type is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileUrl: z.string().min(1, 'File URL is required'),
});
