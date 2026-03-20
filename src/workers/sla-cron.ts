import { processApprovalSLAs } from './approval-sla.worker';
import { logger } from '../config/logger';

const SLA_CHECK_INTERVAL = 15 * 60 * 1000; // Every 15 minutes

export function startSLACron() {
  logger.info('Starting SLA enforcement cron (every 15 minutes)');
  setInterval(async () => {
    try {
      await processApprovalSLAs();
    } catch (err) {
      logger.error('SLA cron error:', err);
    }
  }, SLA_CHECK_INTERVAL);
  // Run immediately on startup too
  processApprovalSLAs().catch(err => logger.error('Initial SLA check error:', err));
}
