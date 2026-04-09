import type { NotificationChannel, NotificationPriority } from '@prisma/client';

export interface DispatchInput {
  companyId: string;
  triggerEvent: string;
  traceId?: string | undefined;

  // Entity reference (for dedup, actionUrl, rule matching)
  entityType?: string | undefined;
  entityId?: string | undefined;

  // Template variable tokens
  tokens?: Record<string, unknown> | undefined;

  // Recipient resolution
  explicitRecipients?: string[] | undefined;
  recipientContext?: {
    requesterId?: string | undefined;
    approverIds?: string[] | undefined;
    managerId?: string | undefined;
    departmentId?: string | undefined;
  } | undefined;

  // Overrides
  priority?: NotificationPriority | undefined;
  systemCritical?: boolean | undefined;
  actionUrl?: string | undefined;

  // Ad-hoc mode (no rule required — useful for test sends and legacy shim)
  adHoc?: {
    title: string;
    body: string;
    channels: NotificationChannel[];
    priority?: NotificationPriority | undefined;
  } | undefined;

  // Type classification written to Notification.type
  type?: string | undefined;
}

export interface DispatchResult {
  traceId: string;
  enqueued: number;
  notificationIds: string[];
}

export interface QueueablePayload {
  notificationId: string;
  userId: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  traceId: string;
  category?: string | null;
  entityType?: string | null;
  systemCritical: boolean;
}
