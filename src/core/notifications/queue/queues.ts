import { Queue } from 'bullmq';
import { bullmqConnection, BULLMQ_PREFIX } from './connection';

const baseOpts = {
  connection: bullmqConnection,
  prefix: BULLMQ_PREFIX,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: false,
  },
};

// Priority-partitioned delivery queues
export const notifQueueHigh    = new Queue('notifications:high',    baseOpts);
export const notifQueueDefault = new Queue('notifications:default', baseOpts);
export const notifQueueLow     = new Queue('notifications:low',     baseOpts);

// Dead-letter queue
export const notifQueueDLQ = new Queue('notifications:dlq', {
  ...baseOpts,
  defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
});

// Expo receipt polling queue (repeatable)
export const notifQueueReceipts = new Queue('notifications:receipts', baseOpts);

// DLQ sweeper queue (repeatable)
export const notifQueueDlqSweep = new Queue('notifications:dlq-sweep', baseOpts);

export const ALL_DELIVERY_QUEUES = [notifQueueHigh, notifQueueDefault, notifQueueLow] as const;

export function pickQueueByPriority(priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): Queue {
  if (priority === 'CRITICAL' || priority === 'HIGH') return notifQueueHigh;
  if (priority === 'MEDIUM') return notifQueueDefault;
  return notifQueueLow;
}
