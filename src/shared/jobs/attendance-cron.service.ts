import cron from 'node-cron';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notificationService } from '../../core/notifications/notification.service';
import { mapShiftToRecord } from '../services/shift-mapping.service';
import { checkIfStale, autoCloseStaleRecord } from '../services/stale-checkout-resolver.service';
import { getCachedCompanySettings } from '../utils/config-cache';
import { DateTime } from 'luxon';

class AttendanceCronService {
  /**
   * A5: Auto-mark absent after N consecutive days without punch.
   * Runs daily at 2:00 AM.
   */
  async processAutoAbsent() {
    const companies = await platformPrisma.attendanceRule.findMany({
      where: { autoAbsentAfterDays: { gt: 0 } },
      select: { companyId: true, autoAbsentAfterDays: true },
    });

    for (const rule of companies) {
      const cutoffDate = DateTime.now()
        .minus({ days: rule.autoAbsentAfterDays })
        .startOf('day')
        .toJSDate();

      // Find active employees with no attendance since cutoff
      const employees = await platformPrisma.employee.findMany({
        where: {
          companyId: rule.companyId,
          status: 'ACTIVE',
          attendanceRecords: {
            none: { date: { gte: cutoffDate } },
          },
        },
        select: { id: true, companyId: true, shiftId: true },
      });

      for (const emp of employees) {
        // Create ABSENT records for each missing day from cutoff to yesterday
        let day = DateTime.fromJSDate(cutoffDate);
        const yesterday = DateTime.now().startOf('day').minus({ days: 1 });

        while (day <= yesterday) {
          const existing = await platformPrisma.attendanceRecord.findFirst({
            where: { employeeId: emp.id, date: day.toJSDate() },
          });

          if (!existing) {
            await platformPrisma.attendanceRecord.create({
              data: {
                employeeId: emp.id,
                companyId: emp.companyId,
                shiftId: emp.shiftId,
                date: day.toJSDate(),
                status: 'ABSENT',
                source: 'MANUAL',
                finalStatusReason: `Auto-absent: no punch for ${rule.autoAbsentAfterDays}+ days`,
              },
            });
          }
          day = day.plus({ days: 1 });
        }
      }

      if (employees.length > 0) {
        logger.info(
          `Auto-absent processed for company ${rule.companyId}: ${employees.length} employees`,
        );
      }
    }
  }

  /**
   * A7: Missing punch alert — notify employees with incomplete punches.
   * Runs daily at 10:00 PM.
   */
  async processMissingPunchAlerts() {
    const companies = await platformPrisma.attendanceRule.findMany({
      where: { missingPunchAlert: true },
      select: { companyId: true },
    });

    const today = DateTime.now().startOf('day').toJSDate();

    for (const rule of companies) {
      const incompleteRecords = await platformPrisma.attendanceRecord.findMany({
        where: {
          companyId: rule.companyId,
          date: today,
          punchIn: { not: null },
          punchOut: null,
          status: { notIn: ['ON_LEAVE', 'HOLIDAY', 'WEEK_OFF'] },
        },
        select: { employeeId: true, date: true },
      });

      for (const record of incompleteRecords) {
        await notificationService
          .dispatch({
            companyId: rule.companyId,
            triggerEvent: 'MISSING_PUNCH_ALERT',
            entityType: 'AttendanceRecord',
            entityId: record.employeeId,
            explicitRecipients: [record.employeeId],
            tokens: {
              employee_name: '',
              date: record.date.toISOString().split('T')[0],
            },
            priority: 'MEDIUM',
            type: 'ATTENDANCE',
            actionUrl: '/company/hr/my-attendance',
          })
          .catch((err: unknown) =>
            logger.warn('Failed to dispatch missing punch alert', err),
          );
      }

      if (incompleteRecords.length > 0) {
        logger.info(
          `Missing punch alerts sent for company ${rule.companyId}: ${incompleteRecords.length} employees`,
        );
      }
    }
  }

  /**
   * Auto shift mapping for records that missed checkout-time mapping.
   * Runs daily at 2:30 AM.
   */
  async processAutoShiftMapping() {
    const companies = await platformPrisma.attendanceRule.findMany({
      where: { autoShiftMappingEnabled: true },
      select: { companyId: true, minShiftMatchPercentage: true },
    });

    for (const rule of companies) {
      const companySettings = await getCachedCompanySettings(rule.companyId);
      const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

      // Find records with completed punches but no shift assigned
      const unmapped = await platformPrisma.attendanceRecord.findMany({
        where: {
          companyId: rule.companyId,
          shiftId: null,
          punchIn: { not: null },
          punchOut: { not: null },
          isAutoMapped: false,
          date: { gte: DateTime.now().minus({ days: 7 }).startOf('day').toJSDate() },
        },
        select: { id: true, employeeId: true, punchIn: true, punchOut: true },
      });

      let mapped = 0;
      for (const record of unmapped) {
        if (!record.punchIn || !record.punchOut) continue;
        const result = await mapShiftToRecord({
          companyId: rule.companyId,
          employeeId: record.employeeId,
          punchIn: record.punchIn,
          punchOut: record.punchOut,
          currentShiftId: null,
          minShiftMatchPercentage: rule.minShiftMatchPercentage,
          companyTimezone,
        });
        if (result.autoMapped && result.mappedShiftId) {
          await platformPrisma.attendanceRecord.update({
            where: { id: record.id },
            data: { shiftId: result.mappedShiftId, isAutoMapped: true },
          });
          mapped++;
        }
      }

      if (mapped > 0) {
        logger.info(`Auto shift mapping cron: company ${rule.companyId} — ${mapped}/${unmapped.length} records mapped`);
      }
    }
  }

  /**
   * Weekly review reminder — notify HR admins about unreviewed attendance.
   * Runs every Monday at 9:00 AM.
   */
  async processWeeklyReviewReminders() {
    const companies = await platformPrisma.attendanceRule.findMany({
      where: { weeklyReviewEnabled: true, weeklyReviewRemindersEnabled: true },
      select: { companyId: true },
    });

    const lastWeekStart = DateTime.now().startOf('week').minus({ weeks: 1 }).toJSDate();
    const lastWeekEnd = DateTime.now().startOf('week').minus({ days: 1 }).toJSDate();

    for (const rule of companies) {
      const unreviewed = await platformPrisma.attendanceRecord.count({
        where: {
          companyId: rule.companyId,
          date: { gte: lastWeekStart, lte: lastWeekEnd },
          isReviewed: false,
          OR: [
            { punchIn: null, status: { notIn: ['HOLIDAY', 'WEEK_OFF', 'ON_LEAVE'] } },
            { punchOut: null, punchIn: { not: null } },
            { isAutoMapped: true },
            { leaveRequestId: { not: null }, workedHours: { gt: 0 } },
          ],
        },
      });

      if (unreviewed > 0) {
        await notificationService
          .dispatch({
            companyId: rule.companyId,
            triggerEvent: 'WEEKLY_REVIEW_REMINDER',
            entityType: 'AttendanceRecord',
            entityId: rule.companyId,
            tokens: {
              count: String(unreviewed),
              week_start: DateTime.fromJSDate(lastWeekStart).toFormat('dd MMM yyyy'),
              week_end: DateTime.fromJSDate(lastWeekEnd).toFormat('dd MMM yyyy'),
            },
            priority: 'MEDIUM',
            type: 'ATTENDANCE',
            actionUrl: '/company/hr/attendance',
          })
          .catch((err: unknown) =>
            logger.warn('Failed to dispatch weekly review reminder', err),
          );

        logger.info(`Weekly review reminder: company ${rule.companyId} — ${unreviewed} unreviewed records`);
      }
    }
  }

  /**
   * Auto-close stale open records (forgotten checkouts).
   * Respects cross-day/night shifts — only closes records past their expected end + buffer.
   * Runs hourly as a safety net (primary auto-close happens in getMyAttendanceStatus).
   */
  async processStaleCheckouts() {
    // Find all open records older than today (punchIn set, punchOut null, date < today)
    const today = DateTime.now().startOf('day').toJSDate();
    const staleRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        punchIn: { not: null },
        punchOut: null,
        date: { lt: today },
        status: { notIn: ['ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'ABSENT'] },
      },
      select: {
        id: true,
        employeeId: true,
        companyId: true,
        punchIn: true,
        shiftId: true,
        date: true,
        locationId: true,
      },
      take: 500, // batch limit
    });

    if (staleRecords.length === 0) return;

    let closed = 0;
    let skipped = 0;
    for (const record of staleRecords) {
      try {
        if (!record.punchIn) continue;
        const companySettings = await getCachedCompanySettings(record.companyId);
        const tz = companySettings.timezone ?? 'Asia/Kolkata';

        const result = await checkIfStale(
          { id: record.id, punchIn: record.punchIn, shiftId: record.shiftId, date: record.date },
          tz,
        );

        if (result.isStale && result.autoCloseTime) {
          await autoCloseStaleRecord(record as any, result.autoCloseTime, tz, result.reason);
          closed++;
        } else {
          skipped++; // Legitimate cross-day shift still in progress
        }
      } catch (err) {
        logger.warn(`Stale checkout cron: failed for record ${record.id}`, err);
      }
    }

    if (closed > 0 || skipped > 0) {
      logger.info(`Stale checkout cron: ${closed} closed, ${skipped} skipped (cross-day)`);
    }
  }

  startAll() {
    cron.schedule('0 2 * * *', () => {
      this.processAutoAbsent().catch((err) =>
        logger.error('Auto-absent cron failed', err),
      );
    });

    cron.schedule('0 22 * * *', () => {
      this.processMissingPunchAlerts().catch((err) =>
        logger.error('Missing punch alert cron failed', err),
      );
    });

    // Auto shift mapping — daily at 2:30 AM
    cron.schedule('30 2 * * *', () => {
      this.processAutoShiftMapping().catch((err) =>
        logger.error('Auto shift mapping cron failed', err),
      );
    });

    // Weekly review reminders — Monday at 9:00 AM
    cron.schedule('0 9 * * 1', () => {
      this.processWeeklyReviewReminders().catch((err) =>
        logger.error('Weekly review reminder cron failed', err),
      );
    });

    // Stale checkout auto-close — hourly
    cron.schedule('0 * * * *', () => {
      this.processStaleCheckouts().catch((err) =>
        logger.error('Stale checkout cron failed', err),
      );
    });

    logger.info(
      'Attendance cron jobs started (auto-absent@2AM, shift-mapping@2:30AM, stale-checkout@hourly, missing-punch@10PM, weekly-review@Mon9AM)',
    );
  }
}

export const attendanceCronService = new AttendanceCronService();
