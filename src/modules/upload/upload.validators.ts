import { z } from 'zod';
import { FILE_CATEGORY_CONFIG, type FileCategory } from '../../shared/constants/upload';

const validCategories = Object.keys(FILE_CATEGORY_CONFIG) as [FileCategory, ...FileCategory[]];

export const requestUploadSchema = z.object({
  category: z.enum(validCategories, {
    errorMap: () => ({ message: `Invalid category. Must be one of: ${validCategories.join(', ')}` }),
  }),
  entityId: z.string().min(1, 'Entity ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  contentType: z.string().min(1, 'Content type is required'),
});

export const requestUploadPlatformSchema = requestUploadSchema.extend({
  companyId: z.string().min(1, 'Company ID is required for platform uploads'),
});

export const downloadUrlSchema = z.object({
  key: z.string().min(1, 'File key is required'),
});
