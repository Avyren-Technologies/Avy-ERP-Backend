import { logger } from '../config/logger';
import { cacheRedis } from '../config/redis';
import { createReportCacheKey } from '../shared/utils';
import { reportQueue as reportQueueInfra } from '../infrastructure/queue/report.queue';

// Use the centralised ReportQueue instance so there is only one Bull client
// for this queue in the process (avoids duplicate event emitters and
// ambiguous lifecycle ownership).
const reportQueue = reportQueueInfra.getQueue();

// Report generation jobs
reportQueue.process('generate-sales-report', async (job) => {
  const { tenantId, filters, userId } = job.data;

  logger.info(`Generating sales report for tenant: ${tenantId}`, { jobId: job.id });

  try {
    // TODO: Implement actual report generation logic
    // This would involve querying tenant database, generating Excel/PDF, etc.

    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const reportUrl = `https://storage.avyerp.com/reports/sales-${tenantId}-${Date.now()}.xlsx`;

    // Cache report URL for 24 hours
    await cacheRedis.setex(createReportCacheKey('sales', tenantId, String(job.id)), 86400, reportUrl);

    logger.info(`Sales report generated successfully: ${reportUrl}`);

    return { reportUrl, status: 'completed' };
  } catch (error) {
    logger.error(`Failed to generate sales report for tenant ${tenantId}:`, error);
    throw error;
  }
});

reportQueue.process('generate-production-report', async (job) => {
  const { tenantId, filters, userId } = job.data;

  logger.info(`Generating production report for tenant: ${tenantId}`, { jobId: job.id });

  try {
    // TODO: Implement production report generation
    await new Promise(resolve => setTimeout(resolve, 3000));

    const reportUrl = `https://storage.avyerp.com/reports/production-${tenantId}-${Date.now()}.xlsx`;

    await cacheRedis.setex(createReportCacheKey('production', tenantId, String(job.id)), 86400, reportUrl);

    return { reportUrl, status: 'completed' };
  } catch (error) {
    logger.error(`Failed to generate production report for tenant ${tenantId}:`, error);
    throw error;
  }
});

reportQueue.process('generate-hr-report', async (job) => {
  const { tenantId, filters, userId } = job.data;

  logger.info(`Generating HR report for tenant: ${tenantId}`, { jobId: job.id });

  try {
    // TODO: Implement HR report generation
    await new Promise(resolve => setTimeout(resolve, 2500));

    const reportUrl = `https://storage.avyerp.com/reports/hr-${tenantId}-${Date.now()}.xlsx`;

    await cacheRedis.setex(createReportCacheKey('hr', tenantId, String(job.id)), 86400, reportUrl);

    return { reportUrl, status: 'completed' };
  } catch (error) {
    logger.error(`Failed to generate HR report for tenant ${tenantId}:`, error);
    throw error;
  }
});

// Queue event handlers
reportQueue.on('completed', (job, result) => {
  logger.info(`Report job completed: ${job.id}`, { type: job.name, result });
});

reportQueue.on('failed', (job, err) => {
  logger.error(`Report job failed: ${job.id}`, { type: job.name, error: err.message });
});

reportQueue.on('stalled', (job) => {
  logger.warn(`Report job stalled: ${job.id}`, { type: job.name });
});

// Graceful shutdown — delegate to the infrastructure owner so lifecycle is
// managed in one place.
process.on('SIGTERM', async () => {
  logger.info('Report worker shutting down...');
  await reportQueueInfra.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Report worker shutting down...');
  await reportQueueInfra.close();
  process.exit(0);
});

logger.info('Report worker started and listening for jobs...');

// Export for testing
export { reportQueueInfra as reportQueue };
