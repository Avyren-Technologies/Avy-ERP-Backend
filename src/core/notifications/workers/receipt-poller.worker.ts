import { Worker } from 'bullmq';
import { Expo } from 'expo-server-sdk';
import { bullmqConnection, BULLMQ_PREFIX } from '../queue/connection';
import { notifQueueReceipts } from '../queue/queues';
import { platformPrisma } from '../../../config/database';
import { recordEvent } from '../events/event-emitter';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {});

/**
 * Schedule the repeatable receipt poller job. Idempotent — uses a stable jobId.
 */
export async function ensureReceiptPollerScheduled(): Promise<void> {
  await notifQueueReceipts.add(
    'poll-receipts',
    {},
    {
      repeat: { every: env.NOTIFICATIONS_RECEIPT_POLL_SEC * 1000 },
      jobId: 'receipt-poller-singleton',
    },
  );
}

/**
 * Start the receipt poller worker. Runs in-process (lightweight).
 *
 * For each SENT NotificationEvent with an expoTicketId and no receiptCheckedAt,
 * within the 15-minute window, fetch the receipt from Expo and update the row.
 * Emits DELIVERED / BOUNCED / FAILED follow-up events so analytics stays accurate.
 * After 15 minutes, unchecked tickets are marked 'unknown' and never polled again.
 */
export function startReceiptPollerWorker() {
  return new Worker(
    'notifications:receipts',
    async () => {
      const maxAgeMs = env.NOTIFICATIONS_RECEIPT_MAX_AGE_MIN * 60 * 1000;
      const cutoff = new Date(Date.now() - maxAgeMs);

      const pending = await platformPrisma.notificationEvent.findMany({
        where: {
          provider: 'expo',
          expoTicketId: { not: null },
          receiptCheckedAt: null,
          occurredAt: { gte: cutoff },
          event: 'SENT',
        },
        take: 500,
      });
      if (pending.length === 0) return;

      const ticketIds = pending.map((p) => p.expoTicketId!).filter(Boolean);
      const chunks = expo.chunkPushNotificationReceiptIds(ticketIds);

      for (const chunk of chunks) {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          for (const [ticketId, receipt] of Object.entries(receipts)) {
            const event = pending.find((p) => p.expoTicketId === ticketId);
            if (!event) continue;

            await platformPrisma.notificationEvent.update({
              where: { id: event.id },
              data: {
                receiptCheckedAt: new Date(),
                receiptStatus: receipt.status,
                errorCode: receipt.status === 'error' ? (receipt as any).details?.error ?? null : null,
                errorMessage: receipt.status === 'error' ? (receipt as any).message ?? null : null,
              },
            });

            if (receipt.status === 'ok') {
              await recordEvent({
                notificationId: event.notificationId,
                channel: 'PUSH',
                event: 'DELIVERED',
                provider: 'expo',
                expoTicketId: ticketId,
                traceId: event.traceId,
                source: 'SYSTEM',
              });
            } else {
              const errCode = (receipt as any).details?.error;
              const eventType = errCode === 'DeviceNotRegistered' ? 'BOUNCED' : 'FAILED';
              await recordEvent({
                notificationId: event.notificationId,
                channel: 'PUSH',
                event: eventType,
                provider: 'expo',
                expoTicketId: ticketId,
                errorCode: errCode,
                errorMessage: (receipt as any).message,
                traceId: event.traceId,
                source: 'SYSTEM',
              });
            }
          }
        } catch (err) {
          logger.error('Receipt polling chunk failed', { error: err });
        }
      }

      // Mark stale (>15 min old) tickets as 'unknown' and stop polling them
      await platformPrisma.notificationEvent.updateMany({
        where: {
          provider: 'expo',
          expoTicketId: { not: null },
          receiptCheckedAt: null,
          occurredAt: { lt: cutoff },
        },
        data: { receiptCheckedAt: new Date(), receiptStatus: 'unknown' },
      });
    },
    { connection: bullmqConnection, prefix: BULLMQ_PREFIX, concurrency: 1 },
  );
}
