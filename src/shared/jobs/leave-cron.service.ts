import cron from 'node-cron';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { leaveService } from '../../modules/hr/leave/leave.service';
import { mutateBalance } from '../../modules/hr/leave/leave-balance.helpers';

class LeaveCronService {
  /**
   * Daily Accrual Check — accrue leave balances for all active companies.
   * Runs daily at 00:30 AM UTC.
   */
  async processDailyAccrual() {
    const companies = await platformPrisma.company.findMany({
      select: { id: true, companySettings: { select: { timezone: true } } },
    });

    for (const company of companies) {
      try {
        const tz = company.companySettings?.timezone ?? 'UTC';
        const now = DateTime.now().setZone(tz);
        await leaveService.accrueBalances(company.id, now.month, now.year, now.day);
      } catch (err: any) {
        logger.error(`[leave-cron] Accrual failed for company ${company.id}: ${err.message}`);
      }
    }

    logger.info(`[leave-cron] Daily accrual check completed for ${companies.length} companies`);
  }

  /**
   * Daily Expiry Cleanup — expire carry-forward balances past their expiresAt date.
   * Uses idempotency keys and JobExecution to avoid double-processing.
   * Runs daily at 02:00 AM UTC.
   */
  async processExpiryCleanup() {
    const companies = await platformPrisma.company.findMany({
      select: { id: true, companySettings: { select: { timezone: true } } },
    });

    for (const company of companies) {
      try {
        const tz = company.companySettings?.timezone ?? 'UTC';
        const today = DateTime.now().setZone(tz).startOf('day').toJSDate();
        const periodKey = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');

        // Check if already processed today
        const existing = await platformPrisma.jobExecution.findUnique({
          where: {
            jobType_companyId_periodKey: {
              jobType: 'EXPIRY_CLEANUP',
              companyId: company.id,
              periodKey,
            },
          },
        });
        if (existing?.status === 'COMPLETED') continue;

        const job = await platformPrisma.jobExecution.upsert({
          where: {
            jobType_companyId_periodKey: {
              jobType: 'EXPIRY_CLEANUP',
              companyId: company.id,
              periodKey,
            },
          },
          create: {
            jobType: 'EXPIRY_CLEANUP',
            companyId: company.id,
            periodKey,
            status: 'RUNNING',
          },
          update: { status: 'RUNNING', startedAt: new Date() },
        });

        const expiredBalances = await platformPrisma.leaveBalance.findMany({
          where: {
            companyId: company.id,
            expiresAt: { lte: today },
            balance: { gt: 0 },
          },
        });

        let processed = 0;
        for (const balance of expiredBalances) {
          try {
            await platformPrisma.$transaction(async (tx) => {
              const idempotencyKey = `expire-${balance.id}-${periodKey}`;
              const existingTx = await tx.leaveBalanceTransaction.findUnique({
                where: { idempotencyKey },
              });
              if (existingTx) return;

              const expiredAmount = Number(balance.openingBalance);
              if (expiredAmount <= 0) return;

              await mutateBalance(
                tx,
                balance.id,
                balance.version ?? 0,
                { openingBalance: 0 },
                {
                  type: 'EXPIRED',
                  delta: -expiredAmount,
                  changedBy: 'system',
                  reason: 'Carry-forward balance expired',
                  source: 'CRON',
                  idempotencyKey,
                },
                company.id,
              );

              processed++;
            });
          } catch (err: any) {
            logger.error(
              `[leave-cron] Expiry failed for balance ${balance.id}: ${err.message}`,
            );
          }
        }

        await platformPrisma.jobExecution.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            result: { processed },
          },
        });

        if (processed > 0) {
          logger.info(
            `[leave-cron] Expired ${processed} balances for company ${company.id}`,
          );
        }
      } catch (err: any) {
        logger.error(
          `[leave-cron] Expiry cleanup failed for company ${company.id}: ${err.message}`,
        );
      }
    }

    logger.info('[leave-cron] Expiry cleanup completed');
  }

  /**
   * Annual Carry Forward — carry forward balances from previous year to current year.
   * Runs on January 1st at 01:00 AM UTC.
   */
  async processAnnualCarryForward() {
    const companies = await platformPrisma.company.findMany({
      select: { id: true },
    });

    const currentYear = new Date().getFullYear();
    const fromYear = currentYear - 1;

    for (const company of companies) {
      try {
        await leaveService.carryForwardBalances(company.id, fromYear, currentYear);
        logger.info(
          `[leave-cron] Carry forward completed for company ${company.id} (${fromYear} → ${currentYear})`,
        );
      } catch (err: any) {
        logger.error(
          `[leave-cron] Carry forward failed for company ${company.id}: ${err.message}`,
        );
      }
    }

    logger.info('[leave-cron] Annual carry forward completed');
  }

  startAll() {
    // Daily accrual check at 00:30 AM UTC
    cron.schedule('30 0 * * *', () => {
      this.processDailyAccrual().catch((err) =>
        logger.error('[leave-cron] Accrual job failed', err),
      );
    });

    // Daily expiry cleanup at 02:00 AM UTC
    cron.schedule('0 2 * * *', () => {
      this.processExpiryCleanup().catch((err) =>
        logger.error('[leave-cron] Expiry cleanup job failed', err),
      );
    });

    // Annual carry forward — January 1st at 01:00 AM UTC
    cron.schedule('0 1 1 1 *', () => {
      this.processAnnualCarryForward().catch((err) =>
        logger.error('[leave-cron] Carry forward job failed', err),
      );
    });

    logger.info(
      'Leave cron jobs started (accrual@00:30, expiry-cleanup@02:00, carry-forward@Jan1-01:00)',
    );
  }
}

export const leaveCronService = new LeaveCronService();
