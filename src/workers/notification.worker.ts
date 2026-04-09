import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { bullmqConnection, BULLMQ_PREFIX } from '../core/notifications/queue/connection';
import { notifQueueDLQ } from '../core/notifications/queue/queues';
import {
  WORKER_CONCURRENCY,
  WORKER_LIMITER_HIGH,
  WORKER_LIMITER_DEFAULT,
  WORKER_LIMITER_LOW,
} from '../core/notifications/queue/rate-limiter-config';
import { channelRouter } from '../core/notifications/channels/channel-router';
import { isAlreadySent, markSent } from '../core/notifications/idempotency/worker-idempotency';
import { checkConsent } from '../core/notifications/dispatch/consent-gate';
import { recordEvent, updateDeliveryStatus } from '../core/notifications/events/event-emitter';
import { logger } from '../config/logger';
import { notificationService } from '../core/notifications/notification.service';

// Initialise Firebase Admin so the FCM provider can dispatch web pushes.
void notificationService.initFirebase();

const LIMITERS = {
  'notifications:high': WORKER_LIMITER_HIGH,
  'notifications:default': WORKER_LIMITER_DEFAULT,
  'notifications:low': WORKER_LIMITER_LOW,
} as const;

type QueueName = keyof typeof WORKER_CONCURRENCY;

function makeWorker(queueName: QueueName) {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const { notificationId, userId, channels, traceId, priority, systemCritical } = job.data as {
        notificationId: string;
        userId: string;
        channels: string[];
        traceId: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        systemCritical: boolean;
      };

      logger.info('Notification delivery start', {
        jobId: job.id,
        notificationId,
        channels,
        traceId,
        queue: queueName,
      });

      for (const channel of channels) {
        // Worker-level idempotency guard
        if (await isAlreadySent(notificationId, channel)) {
          logger.info('Skip — already sent (idempotency)', { notificationId, channel, traceId });
          continue;
        }

        // Re-check consent (may have changed since dispatch)
        const consent = await checkConsent({
          userId,
          channel: channel as any,
          priority,
          systemCritical,
        });
        if (!consent.allowed) {
          await updateDeliveryStatus(notificationId, channel as any, 'SKIPPED');
          await recordEvent({
            notificationId,
            channel: channel as any,
            event: 'SKIPPED',
            errorCode: consent.reason,
            traceId,
            source: job.attemptsMade > 0 ? 'RETRY' : 'SYSTEM',
          });
          continue;
        }

        try {
          const result = await channelRouter.send({
            notificationId,
            userId,
            channel: channel as any,
            traceId,
            priority,
          });
          await markSent(notificationId, channel);
          await updateDeliveryStatus(notificationId, channel as any, 'SENT');
          await recordEvent({
            notificationId,
            channel: channel as any,
            event: 'SENT',
            provider: result.provider,
            providerMessageId: result.messageId ?? undefined,
            expoTicketId: result.expoTicketId ?? undefined,
            traceId,
            source: job.attemptsMade > 0 ? 'RETRY' : 'SYSTEM',
          });
        } catch (err) {
          const errCode = (err as any)?.code ?? 'UNKNOWN';
          const errMsg = (err as Error)?.message ?? String(err);
          await updateDeliveryStatus(notificationId, channel as any, 'FAILED');
          await recordEvent({
            notificationId,
            channel: channel as any,
            event: 'FAILED',
            errorCode: errCode,
            errorMessage: errMsg,
            traceId,
            source: job.attemptsMade > 0 ? 'RETRY' : 'SYSTEM',
          });
          throw err; // trigger BullMQ retry
        }
      }
    },
    {
      connection: bullmqConnection,
      prefix: BULLMQ_PREFIX,
      concurrency: WORKER_CONCURRENCY[queueName],
      limiter: LIMITERS[queueName],
    },
  );

  worker.on('completed', (job) => {
    logger.info('Notification job completed', { id: job.id, queue: queueName });
  });

  worker.on('failed', async (job, err) => {
    logger.warn('Notification job failed', {
      id: job?.id,
      queue: queueName,
      attempt: job?.attemptsMade,
      error: err.message,
    });
    // Move to DLQ once all retry attempts exhausted
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      try {
        await notifQueueDLQ.add('dead-letter', {
          originalQueue: queueName,
          jobId: job.id,
          data: job.data,
          error: err.message,
          failedAt: new Date().toISOString(),
        });
      } catch (dlqErr) {
        logger.error('Failed to write to DLQ', { error: dlqErr, jobId: job.id });
      }
    }
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { error: err, queue: queueName });
  });

  return worker;
}

const workers = [
  makeWorker('notifications:high'),
  makeWorker('notifications:default'),
  makeWorker('notifications:low'),
];

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down notification workers`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('Notification workers started (3 priority queues)');

export { workers };
