import { z } from 'zod';

// Semver-ish: 1.0.0, 1.2.3, 10.20.30
const semverRegex = /^\d+\.\d+\.\d+$/;
const semver = z.string().regex(semverRegex, 'Version must be in semver format (e.g. 1.2.3)');

export const platformEnum = z.enum(['ANDROID', 'IOS']);

export const createAppVersionConfigSchema = z.object({
  platform: platformEnum,
  latestVersion: semver,
  minimumVersion: semver,
  recommendedVersion: semver.optional(),
  updateUrl: z.string().url('Must be a valid URL').optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const updateAppVersionConfigSchema = createAppVersionConfigSchema
  .omit({ platform: true })
  .partial()
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: 'At least one field must be provided for update',
  });

export const checkVersionQuerySchema = z.object({
  platform: platformEnum,
  version: semver,
});
