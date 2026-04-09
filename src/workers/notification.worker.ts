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

/**
 * Shared per-notification processing. Used by both the single-notification
 * and bulk job paths. Throws on provider failure so BullMQ retry kicks in.
 *
 * @param args.consentCache Optional pre-loaded cache (used by the bulk path
 *                          to amortize consent lookups across a chunk). If
 *                          absent, loads fresh via `loadConsentCache(userId)`.
 */
async function processOne(args: {
  notificationId: string;
  userId: string;
  channels: NotificationChannel[];
  traceId: string;
  priority: NotificationPriority;
  systemCritical: boolean;
  category?: string | null;
  source: NotificationSource;
  consentCache?: Awaited<ReturnType<typeof loadConsentCache>> | undefined;
}): Promise<void> {
  const {
    notificationId,
    userId,
    channels,
    traceId,
    priority,
    systemCritical,
    category,
    source,
  } = args;

  // Use pre-loaded cache if provided; otherwise load fresh.
  const consentCache = args.consentCache ?? (await loadConsentCache(userId));

  // Track which channels this run successfully claimed — released on throw.
  const claimedThisRun: NotificationChannel[] = [];

  try {
    for (const channel of channels) {
      // 1. Atomic claim — SET NX EX.
      const won = await claimSendSlot(notificationId, channel);
      if (!won) {
        logger.info('Skip — already claimed (idempotency)', { notificationId, channel, traceId });
        continue;
      }
      claimedThisRun.push(channel);

      // 2. Re-check consent from cache (category-aware).
      const consent = evaluateConsent(consentCache, channel, priority, {
        category: category ?? null,
        systemCritical,
      });
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
        const idx = claimedThisRun.indexOf(channel);
        if (idx >= 0) claimedThisRun.splice(idx, 1);
        throw err;
      }
    }
  } catch (err) {
    // Safety net: release any remaining claimed slots.
    for (const ch of claimedThisRun) {
      await releaseSendSlot(notificationId, ch);
    }
    throw err;
  }
}

function makeWorker(queueName: QueueName) {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const source: NotificationSource = job.attemptsMade > 0 ? 'RETRY' : 'SYSTEM';

      // Bulk job shape — process many notifications in parallel.
      if (job.data.isBulk === true) {
        const { notificationIds, userIds, channels, traceId, priority, systemCritical, category } =
          job.data as {
            isBulk: true;
            notificationIds: string[];
            userIds: string[];
            channels: NotificationChannel[];
            traceId: string;
            priority: NotificationPriority;
            systemCritical: boolean;
            category?: string | null;
          };

        logger.info('Notification bulk delivery start', {
          jobId: job.id,
          count: notificationIds.length,
          channels,
          traceId,
          queue: queueName,
        });

        // Pre-load consent caches in parallel so the subsequent processOne
        // calls are DB-free (I4 — amortize consent cache across the chunk).
        const consentCaches = await Promise.all(
          userIds.map((uid) => loadConsentCache(uid)),
        );

        // Process each (notificationId, userId) pair in parallel.
        // allSettled so one failure doesn't stop the rest of the chunk.
        const results = await Promise.allSettled(
          notificationIds.map((nid, idx) =>
            processOne({
              notificationId: nid,
              userId: userIds[idx]!,
              channels,
              traceId,
              priority,
              systemCritical,
              ...(category !== undefined && { category }),
              source,
              consentCache: consentCaches[idx],
            }),
          ),
        );

        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          logger.warn('Bulk delivery partial failure', {
            jobId: job.id,
            total: notificationIds.length,
            failed: failures.length,
          });
          // Re-throw on ANY failure so BullMQ retries the whole chunk.
          // Already-sent items will be skipped by the idempotency claim
          // (`claimSendSlot` — TTL 24h), so retry is safe and only re-attempts
          // the items that actually failed. Without this re-throw, transient
          // provider errors on individual items would be permanently lost to
          // retries.
          throw (failures[0] as PromiseRejectedResult).reason;
        }
        return;
      }

      // Single-notification job (existing shape)
      const { notificationId, userId, channels, traceId, priority, systemCritical, category } =
        job.data as {
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

      await processOne({
        notificationId,
        userId,
        channels,
        traceId,
        priority,
        systemCritical,
        ...(category !== undefined && { category }),
        source,
      });
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
