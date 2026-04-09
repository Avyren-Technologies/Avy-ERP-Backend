import type { NotificationChannel, NotificationPriority } from '@prisma/client';

export interface DispatchInput {
  companyId: string;
  triggerEvent: string;
  traceId?: string;

  // Entity reference (for dedup, actionUrl, rule matching)
  entityType?: string;
  entityId?: string;

  // Template variable tokens
  tokens?: Record<string, unknown>;

  // Recipient resolution
  explicitRecipients?: string[];
  recipientContext?: {
    requesterId?: string;
    approverIds?: string[];
    managerId?: string;
    departmentId?: string;
  };

  // Overrides
  priority?: NotificationPriority;
  systemCritical?: boolean;
  actionUrl?: string;

  // Ad-hoc mode (no rule required — useful for test sends and legacy shim)
  adHoc?: {
    title: string;
    body: string;
    channels: NotificationChannel[];
    priority?: NotificationPriority;
  };

  // Type classification written to Notification.type
  type?: string;
}

export interface DispatchResult {
  traceId: string;
  enqueued: number;
  notificationIds: string[];
  error?: string;
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
