import cron from 'node-cron';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notificationService } from '../../core/notifications/notification.service';

class CompOffExpiryCronService {
  /**
   * Expire comp-off leave balances whose `expiresAt` has passed.
   * Zeroes out the remaining balance, adjusts the `adjusted` field,
   * and sends a notification to the employee.
   *
   * Runs daily at 1:00 AM.
   */
  async processExpiredCompOff() {
    const now = new Date();

    const expiredBalances = await platformPrisma.leaveBalance.findMany({
      where: {
        expiresAt: { lt: now },
        balance: { gt: 0 },
        leaveType: { category: 'COMPENSATORY' },
      },
      include: {
        leaveType: { select: { name: true } },
      },
    });

    if (expiredBalances.length === 0) {
      logger.debug('No expired comp-off balances found');
      return;
    }

    let processed = 0;

    for (const bal of expiredBalances) {
      const expiredDays = Number(bal.balance);

      // Manually compute new adjusted value because Prisma `decrement`
      // on Decimal fields can be unreliable — safer to compute explicitly.
      const newAdjusted = Number(bal.adjusted) - expiredDays;

      await platformPrisma.leaveBalance.update({
        where: { id: bal.id },
        data: {
          balance: 0,
          adjusted: newAdjusted,
        },
      });

      await notificationService
        .dispatch({
          companyId: bal.companyId,
          triggerEvent: 'COMP_OFF_EXPIRED',
          entityType: 'LeaveBalance',
          entityId: bal.id,
          explicitRecipients: [bal.employeeId],
          tokens: {
            employee_name: '',
            days: expiredDays,
            date: bal.expiresAt!.toISOString().split('T')[0],
          },
          priority: 'LOW',
          actionUrl: '/company/hr/my-leave',
        })
        .catch((err: unknown) =>
          logger.warn('Failed to dispatch COMP_OFF_EXPIRED notification', err),
        );

      processed++;
    }

    logger.info(
      `Comp-off expiry processed: ${processed} balances expired`,
    );
  }

  startAll() {
    cron.schedule('0 1 * * *', () => {
      this.processExpiredCompOff().catch((err) =>
        logger.error('Comp-off expiry cron failed', err),
      );
    });

    logger.info(
      'Comp-off expiry cron job started (daily@1AM)',
    );
  }
}

export const compOffExpiryCronService = new CompOffExpiryCronService();
