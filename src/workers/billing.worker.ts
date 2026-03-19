import { platformPrisma } from '../config/database';
import { logger } from '../config/logger';

/**
 * Monthly Invoice Generation Job
 * Schedule: 1st of every month at 00:00 UTC
 * Generates subscription invoices for all active MONTHLY billing type subscriptions.
 */
export async function processMonthlyInvoiceGeneration() {
  logger.info('Starting monthly invoice generation...');

  const subscriptions = await platformPrisma.subscription.findMany({
    where: { status: 'ACTIVE', billingType: 'MONTHLY' },
    include: { tenant: { include: { company: { include: { locations: true } } } } },
  });

  let processed = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      // TODO: Call invoiceService.generateInvoice() for each subscription
      // For now, log the intent
      logger.info(`Would generate monthly invoice for tenant ${sub.tenantId}`);
      processed++;
    } catch (error) {
      logger.error(`Failed to generate invoice for tenant ${sub.tenantId}`, { error });
      failed++;
    }
  }

  logger.info(`Monthly invoice generation complete: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}

/**
 * Annual Renewal Check Job
 * Schedule: Daily at 01:00 UTC
 * Checks for subscriptions expiring within 30 days and generates renewal invoices.
 */
export async function processAnnualRenewalCheck() {
  logger.info('Starting annual renewal check...');

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const subscriptions = await platformPrisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      billingType: 'ANNUAL',
      endDate: { lte: thirtyDaysFromNow, gte: new Date() },
    },
    include: { tenant: { include: { company: true } } },
  });

  let processed = 0;
  for (const sub of subscriptions) {
    try {
      logger.info(`Annual renewal due for tenant ${sub.tenantId}, expires ${sub.endDate}`);
      // TODO: Generate renewal invoice and send notification
      processed++;
    } catch (error) {
      logger.error(`Failed annual renewal check for tenant ${sub.tenantId}`, { error });
    }
  }

  logger.info(`Annual renewal check complete: ${processed} flagged for renewal`);
  return { processed };
}

/**
 * AMC Due Date Check Job
 * Schedule: Daily at 02:00 UTC
 * Transitions AMC status: ACTIVE → OVERDUE (past due), OVERDUE → LAPSED (30+ days, default endpoint → INACTIVE)
 */
export async function processAmcDueDateCheck() {
  logger.info('Starting AMC due date check...');

  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Mark OVERDUE: amcDueDate < today AND amcStatus = ACTIVE
  const overdueResult = await platformPrisma.subscription.updateMany({
    where: {
      amcStatus: 'ACTIVE',
      amcDueDate: { lt: today },
    },
    data: { amcStatus: 'OVERDUE' },
  });
  logger.info(`Marked ${overdueResult.count} subscriptions as AMC OVERDUE`);

  // Mark LAPSED + deactivate tenant: amcDueDate < 30 days ago AND amcStatus = OVERDUE
  const lapsedSubs = await platformPrisma.subscription.findMany({
    where: {
      amcStatus: 'OVERDUE',
      amcDueDate: { lt: thirtyDaysAgo },
    },
    include: { tenant: { include: { company: true } } },
  });

  let deactivated = 0;
  for (const sub of lapsedSubs) {
    try {
      // Check if endpoint is default (platform-hosted) — only deactivate those
      const endpointType = (sub.tenant.company as any)?.endpointType;
      if (endpointType === 'default' || !endpointType) {
        await platformPrisma.$transaction([
          platformPrisma.subscription.update({
            where: { id: sub.id },
            data: { amcStatus: 'LAPSED' },
          }),
          platformPrisma.tenant.update({
            where: { id: sub.tenantId },
            data: { status: 'SUSPENDED' },
          }),
        ]);
        deactivated++;
        logger.warn(`Tenant ${sub.tenantId} deactivated due to AMC lapse (default endpoint)`);
      } else {
        // Custom endpoint — just mark lapsed, don't deactivate
        await platformPrisma.subscription.update({
          where: { id: sub.id },
          data: { amcStatus: 'LAPSED' },
        });
        logger.info(`Tenant ${sub.tenantId} AMC lapsed but self-hosted — no deactivation`);
      }
    } catch (error) {
      logger.error(`Failed AMC lapse processing for tenant ${sub.tenantId}`, { error });
    }
  }

  logger.info(`AMC check complete: ${overdueResult.count} overdue, ${deactivated} deactivated`);
  return { overdue: overdueResult.count, lapsed: lapsedSubs.length, deactivated };
}
