import { DateTime } from 'luxon';
import { platformPrisma } from '../config/database';
import { logger } from '../config/logger';
import { visitService } from '../modules/visitors/core/visit.service';

const AUTO_CHECKOUT_INTERVAL = 5 * 60 * 1000;       // Every 5 minutes

/** Tracks the last date (yyyy-MM-dd) auto-checkout ran per company to avoid repeated runs. */
const lastAutoCheckOutDate = new Map<string, string>();
const OVERSTAY_CHECK_INTERVAL = 15 * 60 * 1000;     // Every 15 minutes
const NO_SHOW_INTERVAL = 6 * 60 * 60 * 1000;        // Every 6 hours
const PASS_EXPIRY_INTERVAL = 6 * 60 * 60 * 1000;    // Every 6 hours

/**
 * Auto check-out visitors for companies that have auto-checkout enabled
 * when the current time in the company's timezone is past the configured auto-checkout time.
 */
async function runAutoCheckOut(): Promise<void> {
  const configs = await platformPrisma.visitorManagementConfig.findMany({
    where: { autoCheckOutEnabled: true },
    select: { companyId: true, autoCheckOutTime: true },
  });

  for (const config of configs) {
    try {
      const settings = await platformPrisma.companySettings.findUnique({
        where: { companyId: config.companyId },
        select: { timezone: true },
      });
      const tz = settings?.timezone ?? 'Asia/Kolkata';
      const now = DateTime.now().setZone(tz);

      const [hours, minutes] = config.autoCheckOutTime.split(':').map(Number);
      const checkOutTime = now.set({ hour: hours!, minute: minutes!, second: 0, millisecond: 0 });

      if (now >= checkOutTime) {
        const todayStr = now.toFormat('yyyy-MM-dd');
        if (lastAutoCheckOutDate.get(config.companyId) === todayStr) continue;

        const count = await visitService.autoCheckOutAll(config.companyId);
        lastAutoCheckOutDate.set(config.companyId, todayStr);
        if (count > 0) {
          logger.info(`VMS auto-checkout: checked out ${count} visitors for company ${config.companyId}`);
        }
      }
    } catch (err) {
      logger.error(`VMS auto-checkout error for company ${config.companyId}:`, err);
    }
  }
}

/**
 * Detect overstaying visitors and log counts per company.
 * Notification dispatch will be wired via the notification category fix.
 */
async function runOverstayDetection(): Promise<void> {
  const configs = await platformPrisma.visitorManagementConfig.findMany({
    where: { overstayAlertEnabled: true },
    select: { companyId: true },
  });

  for (const config of configs) {
    try {
      const overstaying = await visitService.getOverstayingVisitors(config.companyId);
      if (overstaying.length > 0) {
        logger.warn(
          `VMS overstay: ${overstaying.length} overstaying visitor(s) for company ${config.companyId}`,
        );
      }
    } catch (err) {
      logger.error(`VMS overstay detection error for company ${config.companyId}:`, err);
    }
  }
}

/**
 * Mark visits older than 7 days with status EXPECTED as NO_SHOW.
 */
async function runNoShowMarking(): Promise<void> {
  const count = await visitService.markNoShows();
  if (count > 0) {
    logger.info(`VMS no-show: marked ${count} visit(s) as NO_SHOW`);
  }
}

/**
 * Expire recurring visitor passes whose validUntil date has passed.
 */
async function runPassExpiry(): Promise<void> {
  const result = await platformPrisma.recurringVisitorPass.updateMany({
    where: {
      status: 'ACTIVE',
      validUntil: { lt: new Date() },
    },
    data: {
      status: 'EXPIRED',
    },
  });
  if (result.count > 0) {
    logger.info(`VMS pass expiry: expired ${result.count} recurring pass(es)`);
  }
}

export function startVMSCron(): void {
  logger.info('Starting VMS cron jobs (auto-checkout 5m, overstay 15m, no-show 6h, pass-expiry 6h)');

  setInterval(async () => {
    try {
      await runAutoCheckOut();
    } catch (err) {
      logger.error('VMS auto-checkout cron error:', err);
    }
  }, AUTO_CHECKOUT_INTERVAL);

  setInterval(async () => {
    try {
      await runOverstayDetection();
    } catch (err) {
      logger.error('VMS overstay detection cron error:', err);
    }
  }, OVERSTAY_CHECK_INTERVAL);

  setInterval(async () => {
    try {
      await runNoShowMarking();
    } catch (err) {
      logger.error('VMS no-show marking cron error:', err);
    }
  }, NO_SHOW_INTERVAL);

  setInterval(async () => {
    try {
      await runPassExpiry();
    } catch (err) {
      logger.error('VMS pass expiry cron error:', err);
    }
  }, PASS_EXPIRY_INTERVAL);

  // Run all immediately on startup
  runAutoCheckOut().catch(err => logger.error('Initial VMS auto-checkout error:', err));
  runOverstayDetection().catch(err => logger.error('Initial VMS overstay detection error:', err));
  runNoShowMarking().catch(err => logger.error('Initial VMS no-show marking error:', err));
  runPassExpiry().catch(err => logger.error('Initial VMS pass expiry error:', err));
}
