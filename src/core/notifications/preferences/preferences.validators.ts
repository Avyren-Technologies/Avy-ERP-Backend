import { z } from 'zod';

export const updatePreferencesSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  deviceStrategy: z.enum(['ALL', 'LATEST_ONLY']).optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour)')
    .optional()
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour)')
    .optional()
    .nullable(),
}).refine(
  (data) => {
    // If quiet hours enabled, both start and end must be present and distinct
    if (data.quietHoursEnabled === true) {
      if (!data.quietHoursStart || !data.quietHoursEnd) return false;
      if (data.quietHoursStart === data.quietHoursEnd) return false;
    }
    return true;
  },
  { message: 'Quiet hours start and end must be set and different when enabled' },
);

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateCategoryPreferencesSchema = z.object({
  categoryPreferences: z
    .array(
      z.object({
        category: z.string().min(1),
        channel: z.enum(['IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP']),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

export type UpdateCategoryPreferencesInput = z.infer<
  typeof updateCategoryPreferencesSchema
>;
