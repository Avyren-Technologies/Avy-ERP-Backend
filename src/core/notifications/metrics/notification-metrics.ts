import { logger } from '../../../config/logger';
import { env } from '../../../config/env';

/**
 * Metrics facade for the notification system.
 *
 * Default implementation logs structured events that are easy to grep/parse.
 * When a real metrics backend is wired up (Prometheus client, Datadog SDK,
 * StatsD), only this file changes — call sites stay untouched.
 *
 * Conventions:
 *   - Counter names: `notifications.{event}` (e.g. `notifications.dispatched`)
 *   - Histogram names: `notifications.{event}_ms` (e.g. `notifications.dispatch_duration_ms`)
 *   - Tags: low-cardinality labels (channel, status, priority). NOT user IDs.
 */
export const notificationMetrics = {
  increment(
    name: string,
    tags: Record<string, string | number> = {},
    value = 1,
  ): void {
    if (!env.NOTIFICATIONS_METRICS_ENABLED) return;
    logger.info(`[metric] ${name}`, { metric: name, tags, value, type: 'counter' });
  },

  histogram(
    name: string,
    value: number,
    tags: Record<string, string | number> = {},
  ): void {
    if (!env.NOTIFICATIONS_METRICS_ENABLED) return;
    logger.info(`[metric] ${name}`, { metric: name, tags, value, type: 'histogram' });
  },

  gauge(
    name: string,
    value: number,
    tags: Record<string, string | number> = {},
  ): void {
    if (!env.NOTIFICATIONS_METRICS_ENABLED) return;
    logger.info(`[metric] ${name}`, { metric: name, tags, value, type: 'gauge' });
  },
};
