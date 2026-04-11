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
 * Schedule the repeatable receipt poller job. Idempotent — removes any
 * existing repeatable jobs with the same key before re-scheduling so
 * interval changes across deploys take effect immediately.
 */
export async function ensureReceiptPollerScheduled(): Promise<void> {
  try {
    // Remove any existing repeatable first so interval changes take effect
    const existing = await notifQueueReceipts.getRepeatableJobs();
    for (const job of existing) {
      if (job.id === 'receipt-poller-singleton') {
        await notifQueueReceipts.removeRepeatableByKey(job.key);
      }
    }
  } catch (err) {
    logger.warn('Failed to clean up existing receipt poller repeatables', { error: err });
  }

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
 * Start the receipt poller worker.
 *
 * Race safety: the NotificationEvent update uses a compare-and-set
 * (`receiptCheckedAt: null` in the where clause) so only one poll run wins
 * per event. The follow-up DELIVERED/BOUNCED/FAILED event is only recorded
 * if the update actually claimed the row (affectedRows === 1).
 */
export function startReceiptPollerWorker() {
  return new Worker(
    'notifications-receipts',
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

      const ticketIds = pending.flatMap((p) => (p.expoTicketId ? [p.expoTicketId] : []));
      const chunks = expo.chunkPushNotificationReceiptIds(ticketIds);

      for (const chunk of chunks) {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          for (const [ticketId, receipt] of Object.entries(receipts)) {
            const event = pending.find((p) => p.expoTicketId === ticketId);
            if (!event) continue;

            // Compare-and-set: only one poll run per event succeeds
            const claim = await platformPrisma.notificationEvent.updateMany({
              where: { id: event.id, receiptCheckedAt: null },
              data: {
                receiptCheckedAt: new Date(),
                receiptStatus: receipt.status,
                errorCode:
                  receipt.status === 'error'
                    ? (receipt as { details?: { error?: string } }).details?.error ?? null
                    : null,
                errorMessage:
                  receipt.status === 'error'
                    ? truncate((receipt as { message?: string }).message ?? '', 500)
                    : null,
              },
            });
            if (claim.count === 0) continue;

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
              const errCode = (receipt as { details?: { error?: string } }).details?.error;
              const eventType = errCode === 'DeviceNotRegistered' ? 'BOUNCED' : 'FAILED';
              await recordEvent({
                notificationId: event.notificationId,
                channel: 'PUSH',
                event: eventType,
                provider: 'expo',
                expoTicketId: ticketId,
                errorCode: errCode,
                errorMessage: truncate((receipt as { message?: string }).message ?? '', 500),
                traceId: event.traceId,
                source: 'SYSTEM',
              });
            }
          }
        } catch (err) {
          logger.error('Receipt polling chunk failed', { error: err });
        }
      }

      // Mark stale (>15 min) tickets as 'unknown' and stop polling them
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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
