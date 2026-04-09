import cron, { ScheduledTask } from 'node-cron';
import pLimit from 'p-limit';
import { DateTime } from 'luxon';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { notificationService } from '../notification.service';
import { paginateWithCursor } from './pagination';
import type { NotificationChannel, NotificationEventType } from '@prisma/client';

/**
 * Informational + operational notification crons.
 *
 * Daily at 07:00–09:00 company-local (no TZ-awareness here; the cron runs
 * in UTC and each tenant's settings.timezone is applied when filtering).
 * All per-company iteration is capped at NOTIFICATIONS_CRON_COMPANY_CONCURRENCY
 * via pLimit to protect the platform DB pool. Per-company jitter spreads
 * 100 tenants across a 0-60s window to avoid thundering herd on the cron tick.
 *
 * Each cron emission is deduped via a Redis NX key (24h TTL) so that a
 * re-run on the same day is a no-op.
 */
class NotificationCronService {
  private jobs: ScheduledTask[] = [];

  startAll(): void {
    if (!env.NOTIFICATIONS_CRON_ENABLED) {
      logger.info('Notification cron disabled via env');
      return;
    }

    // Informational event crons
    this.jobs.push(cron.schedule('0 8 * * *', () => this.runBirthday()));
    this.jobs.push(cron.schedule('0 8 * * *', () => this.runWorkAnniversary()));
    this.jobs.push(cron.schedule('0 7 * * *', () => this.runHolidayReminder()));
    this.jobs.push(cron.schedule('0 9 * * *', () => this.runProbationEnd()));
    this.jobs.push(cron.schedule('0 8 * * *', () => this.runAssetReturnDue()));
    this.jobs.push(cron.schedule('0 9 * * *', () => this.runCertificateExpiring()));
    this.jobs.push(cron.schedule('0 7 * * *', () => this.runTrainingSessionUpcoming()));

    // Operational crons (§4A.9 aggregation + §4A.12 retention)
    this.jobs.push(cron.schedule('30 1 * * *', () => this.runEventAggregation()));
    this.jobs.push(cron.schedule('0 2 * * *', () => this.runEventCleanup()));

    logger.info('Notification cron service started', { jobs: this.jobs.length });
  }

  stopAll(): void {
    for (const job of this.jobs) job.stop();
    this.jobs = [];
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Idempotent cron dedup with 24h TTL. `true` = claim acquired, proceed. */
  private async checkCronDedup(key: string): Promise<boolean> {
    try {
      const result = await cacheRedis.set(`notif:cron-dedup:${key}`, '1', 'EX', 86400, 'NX');
      return result === 'OK';
    } catch (err) {
      // Fail-open so a Redis outage doesn't silently swallow an entire day's notifications.
      logger.warn('Cron dedup check failed (fail-open)', { error: err, key });
      return true;
    }
  }

  /** Run a per-company cron with jitter + concurrency cap. */
  private async runPerCompany(
    jobName: string,
    handler: (company: { id: string; name: string; timezone: string }) => Promise<void>,
  ): Promise<void> {
    try {
      const rows = await platformPrisma.company.findMany({
        select: {
          id: true,
          name: true,
          companySettings: { select: { timezone: true } },
        },
      });
      const companies = rows.map((r) => ({
        id: r.id,
        name: r.name,
        timezone: r.companySettings?.timezone ?? 'UTC',
      }));

      const limit = pLimit(env.NOTIFICATIONS_CRON_COMPANY_CONCURRENCY);
      const results = await Promise.allSettled(
        companies.map((c) =>
          limit(async () => {
            // Jitter — spreads concurrent tenants across a 0-JITTER_MS window.
            const jitterMs = Math.floor(Math.random() * env.NOTIFICATIONS_CRON_JITTER_MS);
            await new Promise((resolve) => setTimeout(resolve, jitterMs));
            await handler(c);
          }),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn(`${jobName}: some companies failed`, { failed: failures.length, total: companies.length });
      }
    } catch (err) {
      logger.error(`${jobName} cron failed`, { error: err });
    }
  }

  // ── Informational crons ─────────────────────────────────────────────

  private async runBirthday(): Promise<void> {
    await this.runPerCompany('Birthday', async (company) => {
      const tz = company.timezone;
      const today = DateTime.now().setZone(tz);
      const mmdd = today.toFormat('MM-dd');
      const todayStr = today.toFormat('yyyy-MM-dd');

      const BATCH_SIZE = 200;
      for await (const batch of paginateWithCursor<{
        id: string;
        firstName: string;
        lastName: string;
        dateOfBirth: Date;
        user: { id: string } | null;
      }>(
        async (cursor) =>
          platformPrisma.employee.findMany({
            where: {
              companyId: company.id,
              status: { notIn: ['EXITED'] },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              user: { select: { id: true } },
            },
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
          }),
        (r) => r.id,
        BATCH_SIZE,
      )) {
        const celebrating = batch.filter(
          (e) =>
            e.user?.id &&
            DateTime.fromJSDate(e.dateOfBirth).setZone(tz).toFormat('MM-dd') === mmdd,
        );
        if (celebrating.length === 0) continue;

        const recipients: Array<{ userId: string; tokens: Record<string, unknown> }> = [];
        for (const emp of celebrating) {
          const ok = await this.checkCronDedup(`BIRTHDAY:${company.id}:${emp.id}:${todayStr}`);
          if (ok) {
            recipients.push({
              userId: emp.user!.id,
              tokens: { employee_name: `${emp.firstName} ${emp.lastName}`.trim() },
            });
          }
        }
        if (recipients.length > 0) {
          await notificationService.dispatchBulk({
            companyId: company.id,
            triggerEvent: 'BIRTHDAY',
            entityType: 'Employee',
            recipients,
            priority: 'LOW',
            type: 'BIRTHDAY_ANNIVERSARY',
          });
        }
      }
    });
  }

  private async runWorkAnniversary(): Promise<void> {
    await this.runPerCompany('WorkAnniversary', async (company) => {
      const tz = company.timezone;
      const today = DateTime.now().setZone(tz);
      const mmdd = today.toFormat('MM-dd');
      const todayStr = today.toFormat('yyyy-MM-dd');

      const BATCH_SIZE = 200;
      for await (const batch of paginateWithCursor<{
        id: string;
        firstName: string;
        lastName: string;
        joiningDate: Date;
        user: { id: string } | null;
      }>(
        async (cursor) =>
          platformPrisma.employee.findMany({
            where: {
              companyId: company.id,
              status: { notIn: ['EXITED'] },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              joiningDate: true,
              user: { select: { id: true } },
            },
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
          }),
        (r) => r.id,
        BATCH_SIZE,
      )) {
        const celebrating = batch
          .map((e) => {
            const joined = DateTime.fromJSDate(e.joiningDate).setZone(tz);
            const years = today.year - joined.year;
            return { emp: e, years, joinedMmdd: joined.toFormat('MM-dd') };
          })
          .filter((r) => r.emp.user?.id && r.joinedMmdd === mmdd && r.years > 0);
        if (celebrating.length === 0) continue;

        const recipients: Array<{ userId: string; tokens: Record<string, unknown> }> = [];
        for (const { emp, years } of celebrating) {
          const ok = await this.checkCronDedup(`WORK_ANNIVERSARY:${company.id}:${emp.id}:${todayStr}`);
          if (ok) {
            recipients.push({
              userId: emp.user!.id,
              tokens: {
                employee_name: `${emp.firstName} ${emp.lastName}`.trim(),
                years_of_service: years,
              },
            });
          }
        }
        if (recipients.length > 0) {
          await notificationService.dispatchBulk({
            companyId: company.id,
            triggerEvent: 'WORK_ANNIVERSARY',
            entityType: 'Employee',
            recipients,
            priority: 'LOW',
            type: 'BIRTHDAY_ANNIVERSARY',
          });
        }
      }
    });
  }

  private async runHolidayReminder(): Promise<void> {
    await this.runPerCompany('HolidayReminder', async (company) => {
      const tz = company.timezone;
      const today = DateTime.now().setZone(tz).startOf('day');
      const todayStr = today.toFormat('yyyy-MM-dd');
      const in3Days = today.plus({ days: 3 });

      const upcoming = await platformPrisma.holidayCalendar.findMany({
        where: {
          companyId: company.id,
          date: { gte: today.toJSDate(), lte: in3Days.toJSDate() },
        },
      });
      if (upcoming.length === 0) return;

      // Get all active employees in the company for ALL-role fanout.
      const employees = await platformPrisma.employee.findMany({
        where: { companyId: company.id, status: { notIn: ['EXITED'] } },
        select: { id: true, user: { select: { id: true } } },
      });

      for (const holiday of upcoming) {
        const dedupKey = `HOLIDAY_REMINDER:${company.id}:${holiday.id}:${todayStr}`;
        const ok = await this.checkCronDedup(dedupKey);
        if (!ok) continue;

        const holidayDt = DateTime.fromJSDate(holiday.date).setZone(tz).startOf('day');
        const daysUntil = Math.round(holidayDt.diff(today, 'days').days);

        const recipients = employees
          .filter((e) => e.user?.id)
          .map((e) => ({
            userId: e.user!.id,
            tokens: {
              holiday_name: holiday.name,
              holiday_date: holidayDt.toFormat('yyyy-MM-dd'),
              days_until: daysUntil,
            },
          }));
        if (recipients.length === 0) continue;

        await notificationService.dispatchBulk({
          companyId: company.id,
          triggerEvent: 'HOLIDAY_REMINDER',
          entityType: 'HolidayCalendar',
          entityId: holiday.id,
          recipients,
          priority: 'LOW',
          type: 'ANNOUNCEMENTS',
        });
      }
    });
  }

  private async runProbationEnd(): Promise<void> {
    await this.runPerCompany('ProbationEnd', async (company) => {
      const tz = company.timezone;
      const today = DateTime.now().setZone(tz).startOf('day');
      const todayStr = today.toFormat('yyyy-MM-dd');
      const in7Days = today.plus({ days: 7 });

      const ending = await platformPrisma.employee.findMany({
        where: {
          companyId: company.id,
          status: 'PROBATION',
          probationEndDate: {
            gte: today.toJSDate(),
            lte: in7Days.toJSDate(),
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          probationEndDate: true,
          reportingManager: {
            select: { user: { select: { id: true } } },
          },
        },
      });

      for (const emp of ending) {
        if (!emp.probationEndDate || !emp.reportingManager?.user?.id) continue;
        const ok = await this.checkCronDedup(`PROBATION_END:${company.id}:${emp.id}:${todayStr}`);
        if (!ok) continue;

        try {
          await notificationService.dispatch({
            companyId: company.id,
            triggerEvent: 'PROBATION_END_REMINDER',
            entityType: 'Employee',
            entityId: emp.id,
            explicitRecipients: [emp.reportingManager.user.id],
            tokens: {
              employee_name: `${emp.firstName} ${emp.lastName}`.trim(),
              probation_end_date: DateTime.fromJSDate(emp.probationEndDate)
                .setZone(tz)
                .toFormat('yyyy-MM-dd'),
            },
            priority: 'MEDIUM',
            type: 'EMPLOYEE_LIFECYCLE',
          });
        } catch (err) {
          logger.warn('Probation reminder dispatch failed', { error: err, employeeId: emp.id });
        }
      }
    });
  }

  private async runAssetReturnDue(): Promise<void> {
    // Schema doesn't carry an explicit expectedReturnDate on AssetAssignment
    // yet; skip with a debug log so operators know it's a known gap rather
    // than a silent failure. When the field is added, restore the query to
    // filter by `expectedReturnDate` within the next 3 days.
    logger.debug('AssetReturnDue cron skipped — no expectedReturnDate field in schema');
  }

  private async runCertificateExpiring(): Promise<void> {
    await this.runPerCompany('CertificateExpiring', async (company) => {
      const tz = company.timezone;
      const today = DateTime.now().setZone(tz).startOf('day');
      const todayStr = today.toFormat('yyyy-MM-dd');
      const in30Days = today.plus({ days: 30 });

      const noms = await platformPrisma.trainingNomination.findMany({
        where: {
          companyId: company.id,
          certificateExpiryDate: {
            gte: today.toJSDate(),
            lte: in30Days.toJSDate(),
          },
        },
        include: {
          training: { select: { name: true } },
          employee: {
            select: {
              firstName: true,
              lastName: true,
              user: { select: { id: true } },
            },
          },
        },
      });

      for (const nom of noms) {
        if (!nom.employee?.user?.id || !nom.certificateExpiryDate) continue;
        const ok = await this.checkCronDedup(`CERTIFICATE_EXPIRING:${company.id}:${nom.id}:${todayStr}`);
        if (!ok) continue;

        try {
          await notificationService.dispatch({
            companyId: company.id,
            triggerEvent: 'CERTIFICATE_EXPIRING',
            entityType: 'TrainingNomination',
            entityId: nom.id,
            explicitRecipients: [nom.employee.user.id],
            tokens: {
              employee_name: `${nom.employee.firstName} ${nom.employee.lastName}`.trim(),
              training_name: nom.training?.name ?? '',
              expiry_date: DateTime.fromJSDate(nom.certificateExpiryDate).setZone(tz).toFormat('yyyy-MM-dd'),
            },
            priority: 'MEDIUM',
            type: 'TRAINING',
          });
        } catch (err) {
          logger.warn('Certificate expiring dispatch failed', { error: err, nominationId: nom.id });
        }
      }
    });
  }

  private async runTrainingSessionUpcoming(): Promise<void> {
    await this.runPerCompany('TrainingSessionUpcoming', async (company) => {
      const tz = company.timezone;
      const now = DateTime.now().setZone(tz);
      const todayStr = now.toFormat('yyyy-MM-dd');
      const in24h = now.plus({ hours: 24 });

      const sessions = await platformPrisma.trainingSession.findMany({
        where: {
          companyId: company.id,
          startDateTime: {
            gte: now.toJSDate(),
            lte: in24h.toJSDate(),
          },
        },
        include: {
          training: { select: { name: true } },
          nominations: {
            include: {
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  user: { select: { id: true } },
                },
              },
            },
          },
        },
      });

      for (const session of sessions) {
        const ok = await this.checkCronDedup(`TRAINING_SESSION:${company.id}:${session.id}:${todayStr}`);
        if (!ok) continue;

        const recipients = session.nominations
          .filter((n) => n.employee?.user?.id)
          .map((n) => ({
            userId: n.employee!.user!.id,
            tokens: {
              employee_name: `${n.employee!.firstName} ${n.employee!.lastName}`.trim(),
              training_name: session.training?.name ?? '',
              session_date: DateTime.fromJSDate(session.startDateTime).setZone(tz).toFormat('yyyy-MM-dd'),
              session_time: DateTime.fromJSDate(session.startDateTime).setZone(tz).toFormat('HH:mm'),
            },
          }));
        if (recipients.length === 0) continue;

        await notificationService.dispatchBulk({
          companyId: company.id,
          triggerEvent: 'TRAINING_SESSION_UPCOMING',
          entityType: 'TrainingSession',
          entityId: session.id,
          recipients,
          priority: 'MEDIUM',
          type: 'TRAINING',
        });
      }
    });
  }

  // ── Operational crons ───────────────────────────────────────────────

  /** §4A.9 — Aggregate yesterday's NotificationEvent rows into the daily rollup. */
  private async runEventAggregation(): Promise<void> {
    try {
      const yesterday = DateTime.now().minus({ days: 1 }).startOf('day').toJSDate();
      const todayStart = DateTime.now().startOf('day').toJSDate();

      const aggregates = await platformPrisma.$queryRaw<
        Array<{
          companyId: string;
          channel: string;
          event: string;
          provider: string | null;
          count: bigint;
        }>
      >`
        SELECT
          n."companyId",
          ne.channel::text as channel,
          ne.event::text as event,
          ne.provider,
          COUNT(*)::bigint as count
        FROM notification_events ne
        JOIN notifications n ON n.id = ne."notificationId"
        WHERE ne."occurredAt" >= ${yesterday} AND ne."occurredAt" < ${todayStart}
        GROUP BY n."companyId", ne.channel, ne.event, ne.provider
      `;

      let upserted = 0;
      for (const agg of aggregates) {
        try {
          await platformPrisma.notificationEventAggregateDaily.upsert({
            where: {
              companyId_date_channel_event_provider: {
                companyId: agg.companyId,
                date: yesterday,
                channel: agg.channel as NotificationChannel,
                event: agg.event as NotificationEventType,
                provider: agg.provider ?? '',
              },
            },
            create: {
              companyId: agg.companyId,
              date: yesterday,
              channel: agg.channel as NotificationChannel,
              event: agg.event as NotificationEventType,
              provider: agg.provider,
              count: Number(agg.count),
            },
            update: { count: Number(agg.count) },
          });
          upserted++;
        } catch (err) {
          logger.warn('Aggregate upsert failed', { error: err, agg });
        }
      }
      logger.info('Notification event aggregation complete', { rows: upserted });
    } catch (err) {
      logger.error('Notification event aggregation failed', { error: err });
    }
  }

  /** §4A.12 — Delete NotificationEvent rows older than the retention window. */
  private async runEventCleanup(): Promise<void> {
    try {
      const cutoff = DateTime.now()
        .minus({ days: env.NOTIFICATIONS_EVENT_RETENTION_DAYS })
        .toJSDate();

      let totalDeleted = 0;
      // Delete in 10K batches to avoid long-running transactions.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await platformPrisma.notificationEvent.findMany({
          where: { occurredAt: { lt: cutoff } },
          select: { id: true },
          take: 10_000,
        });
        if (batch.length === 0) break;

        const result = await platformPrisma.notificationEvent.deleteMany({
          where: { id: { in: batch.map((b) => b.id) } },
        });
        totalDeleted += result.count;
        if (batch.length < 10_000) break;
      }

      logger.info('NotificationEvent cleanup complete', {
        totalDeleted,
        retentionDays: env.NOTIFICATIONS_EVENT_RETENTION_DAYS,
      });
    } catch (err) {
      logger.error('NotificationEvent cleanup failed', { error: err });
    }
  }
}

export const notificationCronService = new NotificationCronService();
