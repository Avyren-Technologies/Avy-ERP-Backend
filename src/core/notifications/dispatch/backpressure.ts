import { notifQueueDefault, notifQueueLow } from '../queue/queues';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import type { NotificationPriority } from '@prisma/client';

export type BackpressureDecision = 'ALLOW' | 'DROP';

/**
 * Queue depth guard. HIGH/CRITICAL never drop (alert via log on backlog).
 * LOW is the first to be shed, then MEDIUM via downstream controls.
 */
export async function guardBackpressure(priority: NotificationPriority): Promise<BackpressureDecision> {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'ALLOW';

  try {
    const lowWaiting = await notifQueueLow.getWaitingCount();
    if (priority === 'LOW' && lowWaiting > env.NOTIFICATIONS_MAX_QUEUE_LOW) {
      logger.warn('Backpressure drop: LOW queue over limit', { lowWaiting });
      return 'DROP';
    }

    const defaultWaiting = await notifQueueDefault.getWaitingCount();
    if (priority === 'LOW' && defaultWaiting > env.NOTIFICATIONS_MAX_QUEUE_DEFAULT) {
      logger.warn('Backpressure drop: LOW due to DEFAULT queue over limit', { defaultWaiting });
      return 'DROP';
    }

    return 'ALLOW';
  } catch (err) {
    logger.warn('Backpressure check failed (allowing)', { error: err });
    return 'ALLOW';
  }
}
