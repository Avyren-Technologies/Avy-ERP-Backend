/**
 * Rate limiter presets applied to each BullMQ worker.
 * max = jobs per duration window.
 */
export const WORKER_LIMITER_HIGH    = { max: 50, duration: 1000 };
export const WORKER_LIMITER_DEFAULT = { max: 30, duration: 1000 };
export const WORKER_LIMITER_LOW     = { max: 10, duration: 1000 };

export const WORKER_CONCURRENCY = {
  'notifications:high':    20,
  'notifications:default': 10,
  'notifications:low':     5,
} as const;
