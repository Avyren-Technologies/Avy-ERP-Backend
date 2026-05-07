import { logger } from '../config/logger';
import { punchProcessorService } from '../modules/biometric/punch-processor.service';

const PROCESS_INTERVAL = 15 * 1000;  // Every 15 seconds
const RETRY_INTERVAL = 60 * 1000;    // Every 60 seconds

export function startBiometricCron(): void {
  logger.info('Biometric cron jobs started (process 15s, retry 60s)');

  setInterval(async () => {
    try {
      await punchProcessorService.processPendingPunches();
    } catch (err: any) {
      logger.error('Biometric punch processor error', { error: err.message });
    }
  }, PROCESS_INTERVAL);

  setInterval(async () => {
    try {
      await punchProcessorService.retryFailedPunches();
    } catch (err: any) {
      logger.error('Biometric retry processor error', { error: err.message });
    }
  }, RETRY_INTERVAL);

  // Run immediately on startup
  punchProcessorService.processPendingPunches().catch(() => {});
}
