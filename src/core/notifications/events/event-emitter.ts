import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import type { NotificationChannel, NotificationEventType, NotificationSource } from '@prisma/client';

export interface RecordEventInput {
  notificationId: string | null;
  channel: NotificationChannel;
  event: NotificationEventType;
  provider?: string | undefined;
  providerMessageId?: string | undefined;
  expoTicketId?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  traceId: string;
  source?: NotificationSource | undefined;
}

/**
 * Write a NotificationEvent row for analytics + audit.
 * Swallows errors — analytics failure must never break delivery.
 * Events with notificationId=null are skipped (no foreign key target).
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    if (!input.notificationId) return;

    await platformPrisma.notificationEvent.create({
      data: {
        notificationId: input.notificationId,
        channel: input.channel,
        event: input.event,
        provider: input.provider ?? null,
        providerMessageId: input.providerMessageId ?? null,
        expoTicketId: input.expoTicketId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: (input.metadata ?? undefined) as any,
        traceId: input.traceId,
        source: input.source ?? 'SYSTEM',
      },
    });
  } catch (err) {
    logger.warn('Failed to record notification event', { error: err, input });
  }
}

/**
 * Update the deliveryStatus JSON map on a Notification row.
 * Merges with existing status so multiple channels can be tracked.
 */
export async function updateDeliveryStatus(
  notificationId: string,
  channel: NotificationChannel,
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'BOUNCED' | 'RETRYING',
): Promise<void> {
  try {
    const current = await platformPrisma.notification.findUnique({
      where: { id: notificationId },
      select: { deliveryStatus: true },
    });
    const ds = ((current?.deliveryStatus as Record<string, string> | null) ?? {}) as Record<string, string>;
    ds[channel.toLowerCase()] = status;
    await platformPrisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: ds },
    });
  } catch (err) {
    logger.warn('Failed to update deliveryStatus', { error: err, notificationId, channel, status });
  }
}
