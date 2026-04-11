import { Worker } from 'bullmq';
import { bullmqConnection, BULLMQ_PREFIX } from '../queue/connection';
import { notifQueueDLQ, notifQueueDlqSweep } from '../queue/queues';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

/**
 * Schedule the repeatable DLQ sweeper. Idempotent via stable jobId.
 */
export async function ensureDlqSweeperScheduled(): Promise<void> {
  await notifQueueDlqSweep.add(
    'sweep',
    {},
    {
      repeat: { every: 60 * 60 * 1000 }, // hourly
      jobId: 'dlq-sweeper-singleton',
    },
  );
}

/**
 * Remove DLQ entries older than the retention window (default: 7 days).
 */
export function startDlqSweeperWorker() {
  return new Worker(
    'notifications-dlq-sweep',
    async () => {
      const retentionMs = env.NOTIFICATIONS_DLQ_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      try {
        const completedRemoved = await notifQueueDLQ.clean(retentionMs, 1000, 'completed');
        const failedRemoved = await notifQueueDLQ.clean(retentionMs, 1000, 'failed');
        logger.info('DLQ sweep complete', {
          removedCompleted: completedRemoved.length,
          removedFailed: failedRemoved.length,
        });
      } catch (err) {
        logger.error('DLQ sweep failed', { error: err });
      }
    },
    { connection: bullmqConnection, prefix: BULLMQ_PREFIX, concurrency: 1 },
  );
}
