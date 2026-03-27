import { z } from 'zod';

// ── Module Change Metadata ──────────────────────────────────────────

export const moduleChangeMetadataSchema = z.object({
  type: z.enum(['ADD', 'REMOVE']),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  moduleId: z.string().min(1),
  moduleName: z.string().min(1),
});

export type ModuleChangeMetadata = z.infer<typeof moduleChangeMetadataSchema>;

// ── Create Ticket ──────────────────────────────────────────────────

export const createTicketSchema = z
  .object({
    subject: z.string().min(1).max(200),
    category: z.enum(['MODULE_CHANGE', 'BILLING', 'TECHNICAL', 'GENERAL']),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    message: z.string().min(1).max(5000),
    metadata: z.any().optional(),
  })
  .refine(
    (data) => {
      if (data.category === 'MODULE_CHANGE') {
        const result = moduleChangeMetadataSchema.safeParse(data.metadata);
        return result.success;
      }
      return true;
    },
    {
      message:
        'MODULE_CHANGE tickets require metadata with type, locationId, locationName, moduleId, moduleName',
      path: ['metadata'],
    }
  );

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// ── Send Message ───────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ── Update Status ──────────────────────────────────────────────────

export const updateStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ── Reject Module ──────────────────────────────────────────────────

export const rejectModuleSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type RejectModuleInput = z.infer<typeof rejectModuleSchema>;
