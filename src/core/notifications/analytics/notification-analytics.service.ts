import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';

/**
 * Read-only analytics over NotificationEvent + NotificationEventAggregateDaily.
 *
 * The dispatcher inserts a NotificationEvent row per (notificationId, channel,
 * event) tuple. A nightly cron (runEventAggregation) rolls yesterday's events
 * into NotificationEventAggregateDaily so the dashboard can hit pre-aggregated
 * rows instead of scanning the raw event table. A second nightly cron
 * (runEventCleanup) enforces the raw-event retention window.
 *
 * Methods on this service prefer the aggregate table for date-bounded queries
 * longer than yesterday, and fall back to the raw table for "today" windows.
 */
export const notificationAnalyticsService = {
  /**
   * High-level summary KPIs for the top of the dashboard.
   * Defaults to the last 30 days of delivery data.
   */
  async getSummary(companyId: string, days: number = 30) {
    const start = DateTime.now().minus({ days }).startOf('day').toJSDate();

    // Pre-aggregated rows for days older than today
    const aggregateRows = await platformPrisma.notificationEventAggregateDaily.findMany({
      where: { companyId, date: { gte: start } },
      select: { channel: true, event: true, count: true },
    });

    // Today's raw events (not yet aggregated by the nightly cron).
    // Group them in-memory so the dashboard isn't empty on the first day.
    const todayStart = DateTime.now().startOf('day').toJSDate();
    const rawToday = await platformPrisma.$queryRaw<
      Array<{ channel: string; event: string; count: bigint }>
    >`
      SELECT
        ne.channel::text AS channel,
        ne.event::text AS event,
        COUNT(*)::bigint AS count
      FROM notification_events ne
      JOIN notifications n ON n.id = ne."notificationId"
      WHERE n."companyId" = ${companyId}
        AND ne."occurredAt" >= ${todayStart}
      GROUP BY ne.channel, ne.event
    `;

    // Merge both sources into a single stream
    const rows = [
      ...aggregateRows,
      ...rawToday.map((r) => ({
        channel: r.channel,
        event: r.event,
        count: Number(r.count),
      })),
    ];

    let sent = 0;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    const byChannel: Record<string, { sent: number; delivered: number; failed: number }> = {};

    for (const r of rows) {
      const bucket = (byChannel[r.channel] ??= { sent: 0, delivered: 0, failed: 0 });
      switch (r.event) {
        case 'SENT':
          sent += r.count;
          bucket.sent += r.count;
          break;
        case 'DELIVERED':
          delivered += r.count;
          bucket.delivered += r.count;
          break;
        case 'FAILED':
          failed += r.count;
          bucket.failed += r.count;
          break;
        case 'SKIPPED':
          skipped += r.count;
          break;
        default:
          break;
      }
    }

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;

    return {
      rangeDays: days,
      totals: { sent, delivered, failed, skipped },
      byChannel,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
    };
  },

  /**
   * Top failing templates — useful for identifying bad templates that
   * consistently bounce or get rejected by the provider.
   */
  async getTopFailing(companyId: string, days: number = 30, limit: number = 10) {
    const start = DateTime.now().minus({ days }).startOf('day').toJSDate();

    const rows = await platformPrisma.$queryRaw<
      Array<{ templateId: string | null; templateName: string | null; failures: bigint }>
    >`
      SELECT
        n."templateId",
        t."name" AS "templateName",
        COUNT(*)::bigint AS "failures"
      FROM notification_events ne
      JOIN notifications n ON n.id = ne."notificationId"
      LEFT JOIN notification_templates t ON t.id = n."templateId"
      WHERE n."companyId" = ${companyId}
        AND ne.event = 'FAILED'
        AND ne."occurredAt" >= ${start}
      GROUP BY n."templateId", t."name"
      ORDER BY "failures" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      templateId: r.templateId,
      templateName: r.templateName ?? '(ad-hoc or deleted template)',
      failures: Number(r.failures),
    }));
  },

  /**
   * Daily delivery trend — time-series chart input.
   * Groups by date + event for a stacked bar chart.
   */
  async getDeliveryTrend(companyId: string, days: number = 30) {
    const start = DateTime.now().minus({ days }).startOf('day').toJSDate();

    const rows = await platformPrisma.notificationEventAggregateDaily.findMany({
      where: { companyId, date: { gte: start } },
      select: { date: true, event: true, count: true },
      orderBy: { date: 'asc' },
    });

    // Pivot: date → { sent, delivered, failed, skipped }
    const byDate = new Map<
      string,
      { date: string; sent: number; delivered: number; failed: number; skipped: number }
    >();
    for (const r of rows) {
      const key = DateTime.fromJSDate(r.date).toFormat('yyyy-MM-dd');
      const bucket = byDate.get(key) ?? { date: key, sent: 0, delivered: 0, failed: 0, skipped: 0 };
      if (r.event === 'SENT') bucket.sent += r.count;
      else if (r.event === 'DELIVERED') bucket.delivered += r.count;
      else if (r.event === 'FAILED') bucket.failed += r.count;
      else if (r.event === 'SKIPPED') bucket.skipped += r.count;
      byDate.set(key, bucket);
    }
    return Array.from(byDate.values());
  },
};
