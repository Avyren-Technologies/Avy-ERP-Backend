import Queue from 'bull';
import { logger } from '../config/logger';
import { cacheRedis, getBullQueueConfig } from '../config/redis';
import { createAnalyticsCacheKey } from '../shared/utils';

// Create analytics queue
const analyticsQueue = new Queue('analytics', getBullQueueConfig('analytics'));

// Analytics aggregation jobs
analyticsQueue.process('aggregate-oee-metrics', async (job) => {
  const { tenantId, date } = job.data;

  logger.info(`Aggregating OEE metrics for tenant: ${tenantId}`, { date, jobId: job.id });

  try {
    // TODO: Implement OEE aggregation logic
    await new Promise(resolve => setTimeout(resolve, 1000));

    const metrics = {
      availability: 0.95,
      performance: 0.92,
      quality: 0.98,
      oee: 0.85,
    };

    await cacheRedis.setex(createAnalyticsCacheKey('oee', tenantId, date), 3600, JSON.stringify(metrics));

    return { metrics, status: 'completed' };
  } catch (error) {
    logger.error(`Failed to aggregate OEE metrics for tenant ${tenantId}:`, error);
    throw error;
  }
});

analyticsQueue.process('aggregate-production-metrics', async (job) => {
  const { tenantId, period } = job.data;

  logger.info(`Aggregating production metrics for tenant: ${tenantId}`, { period, jobId: job.id });

  try {
    // TODO: Implement production metrics aggregation
    await new Promise(resolve => setTimeout(resolve, 1500));

    const metrics = {
      totalProduction: 1250,
      scrapRate: 0.02,
      efficiency: 0.94,
      downtime: 45, // minutes
    };

    await cacheRedis.setex(createAnalyticsCacheKey('production', tenantId, period), 3600, JSON.stringify(metrics));

    return { metrics, status: 'completed' };
  } catch (error) {
    logger.error(`Failed to aggregate production metrics for tenant ${tenantId}:`, error);
    throw error;
  }
});

// Queue event handlers
analyticsQueue.on('completed', (job, result) => {
  logger.info(`Analytics job completed: ${job.id}`, { type: job.name, result });
});

analyticsQueue.on('failed', (job, err) => {
  logger.error(`Analytics job failed: ${job.id}`, { type: job.name, error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Analytics worker shutting down...');
  await analyticsQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Analytics worker shutting down...');
  await analyticsQueue.close();
  process.exit(0);
});

logger.info('Analytics worker started and listening for jobs...');

// Export for testing
export { analyticsQueue };
