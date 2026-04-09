import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import type { NotificationChannel, NotificationPriority, NotificationSource } from '@prisma/client';
import { bullmqConnection, BULLMQ_PREFIX } from '../core/notifications/queue/connection';
import { notifQueueDLQ } from '../core/notifications/queue/queues';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
import {
  WORKER_CONCURRENCY,
  WORKER_LIMITER_HIGH,
  WORKER_LIMITER_DEFAULT,
  WORKER_LIMITER_LOW,
} from '../core/notifications/queue/rate-limiter-config';
import { channelRouter } from '../core/notifications/channels/channel-router';
import { claimSendSlot, releaseSendSlot } from '../core/notifications/idempotency/worker-idempotency';
import { loadConsentCache, evaluateConsent } from '../core/notifications/dispatch/consent-gate';
import { recordEvent, updateDeliveryStatus } from '../core/notifications/events/event-emitter';
import { logger } from '../config/logger';
import { notificationService } from '../core/notifications/notification.service';

// Initialise Firebase Admin BEFORE starting workers so the first job doesn't
// race with async init and fail with FIREBASE_NOT_INITIALIZED. Node CommonJS
// doesn't support top-level await, so we await inside the bootstrap IIFE.
let workers: Worker[] = [];

async function bootstrap() {
  await notificationService.initFirebase();
  workers = [
    makeWorker('notifications:high'),
    makeWorker('notifications:default'),
    makeWorker('notifications:low'),
  ];
  logger.info('Notification workers started (3 priority queues)');
}

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
      const {
        notificationId,
        userId,
        channels,
        traceId,
        priority,
        systemCritical,
        category,
      } = job.data as {
        notificationId: string;
        userId: string;
        channels: NotificationChannel[];
        traceId: string;
        priority: NotificationPriority;
        systemCritical: boolean;
        category?: string | null;
      };

      logger.info('Notification delivery start', {
        jobId: job.id,
        notificationId,
        channels,
        traceId,
        queue: queueName,
      });

      const source: NotificationSource = job.attemptsMade > 0 ? 'RETRY' : 'SYSTEM';

      // Load consent cache ONCE per job (user, companySettings, preference).
      // The per-channel consent check below is now a pure function, avoiding
      // N+1 DB lookups when a job has multiple channels.
      const consentCache = await loadConsentCache(userId);

      // Track which channels this worker run successfully claimed, so we can
      // release them on throw (to allow retries). Channels already claimed by
      // a previous attempt are NOT released.
      const claimedThisRun: NotificationChannel[] = [];

      try {
        for (const channel of channels) {
          // 1. Atomic claim — SET NX EX. Wins mean we proceed; loses mean another
          //    worker (or a previous attempt that partially succeeded) handled it.
          const won = await claimSendSlot(notificationId, channel);
          if (!won) {
            logger.info('Skip — already claimed (idempotency)', { notificationId, channel, traceId });
            continue;
          }
          claimedThisRun.push(channel);

          // 2. Re-check consent from cache (may have changed since dispatch,
          //    but changing within the same job's consent cache is a negligible
          //    risk — prefs are infrequent and we reload on every new job).
          const consent = evaluateConsent(
            consentCache,
            channel,
            priority,
            category ?? null,
            systemCritical,
          );
          if (!consent.allowed) {
            await updateDeliveryStatus(notificationId, channel, 'SKIPPED');
            await recordEvent({
              notificationId,
              channel,
              event: 'SKIPPED',
              errorCode: consent.reason,
              traceId,
              source,
            });
            // Leave claim in place — SKIPPED is final, don't retry.
            continue;
          }

          // 3. Dispatch to provider
          try {
            const result = await channelRouter.send({
              notificationId,
              userId,
              channel,
              traceId,
              priority,
            });
            await updateDeliveryStatus(notificationId, channel, 'SENT');
            await recordEvent({
              notificationId,
              channel,
              event: 'SENT',
              provider: result.provider,
              providerMessageId: result.messageId ?? undefined,
              expoTicketId: result.expoTicketId ?? undefined,
              traceId,
              source,
            });
            // Keep the claim — SENT is final for the TTL window.
          } catch (err) {
            const errCode = (err as { code?: string })?.code ?? 'UNKNOWN';
            const errMsg = truncate((err as Error)?.message ?? String(err), 500);
            await updateDeliveryStatus(notificationId, channel, 'FAILED');
            await recordEvent({
              notificationId,
              channel,
              event: 'FAILED',
              errorCode: errCode,
              errorMessage: errMsg,
              traceId,
              source,
            });
            // Release the claim so BullMQ retry can re-attempt this channel.
            await releaseSendSlot(notificationId, channel);
            // Remove from claimedThisRun so the outer catch doesn't double-release.
            const idx = claimedThisRun.indexOf(channel);
            if (idx >= 0) claimedThisRun.splice(idx, 1);
            throw err; // trigger BullMQ retry
          }
        }
      } catch (err) {
        // Safety net: release any slots we claimed but didn't explicitly release.
        for (const ch of claimedThisRun) {
          await releaseSendSlot(notificationId, ch);
        }
        throw err;
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
    // Move to DLQ once all retry attempts exhausted.
    // BullMQ v5 does not automatically remove failed jobs from the source queue,
    // so we add an audit entry to the DLQ *and* remove the original from the
    // source to prevent unbounded growth of the source queue's failed set.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      try {
        await notifQueueDLQ.add('dead-letter', {
          originalQueue: queueName,
          jobId: job.id,
          data: job.data,
          error: truncate(err.message, 500),
          failedAt: new Date().toISOString(),
        });
        // Remove from source queue to keep the failed set bounded
        try {
          await job.remove();
        } catch (removeErr) {
          logger.warn('Failed to remove exhausted job from source queue', {
            error: removeErr,
            jobId: job.id,
          });
        }
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

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down notification workers`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap().catch((err) => {
  logger.error('Worker bootstrap failed', { error: err });
  process.exit(1);
});

export { workers };
