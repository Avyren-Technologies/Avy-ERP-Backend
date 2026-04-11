/**
 * Rate limiter presets applied to each BullMQ worker.
 * max = jobs per duration window.
 */
export const WORKER_LIMITER_HIGH    = { max: 50, duration: 1000 };
export const WORKER_LIMITER_DEFAULT = { max: 30, duration: 1000 };
export const WORKER_LIMITER_LOW     = { max: 10, duration: 1000 };

/** BullMQ queue names for the three priority delivery workers (must match `queues.ts`). */
export type NotificationDeliveryQueueName =
  | 'notifications-high'
  | 'notifications-default'
  | 'notifications-low';

export const WORKER_CONCURRENCY: Record<NotificationDeliveryQueueName, number> = {
  'notifications-high': 20,
  'notifications-default': 10,
  'notifications-low': 5,
};
