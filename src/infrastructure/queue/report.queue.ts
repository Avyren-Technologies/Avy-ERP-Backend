// Report queue infrastructure

import Queue from 'bull';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

class ReportQueue {
  private queue: Queue.Queue;

  constructor() {
    this.queue = new Queue('reports', {
      redis: {
        host: env.REDIS_URL.split(':')[0],
        port: parseInt(env.REDIS_URL.split(':')[1] || '6379'),
        db: env.REDIS_QUEUE_DB,
      },
      defaultJobOptions: {
        removeOnComplete: env.QUEUE_REMOVE_ON_COMPLETE,
        removeOnFail: env.QUEUE_REMOVE_ON_FAIL,
      },
    });

    this.setupEventHandlers();
  }

  // Add report generation job
  async addReportJob(type: string, data: any, options?: Queue.JobOptions) {
    try {
      const job = await this.queue.add(type, data, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
        attempts: options?.attempts || 3,
        backoff: options?.backoff || {
          type: 'exponential',
          delay: 5000,
        },
        ...options,
      });

      logger.info(`Report job added: ${job.id}`, { type, data });
      return job;
    } catch (error) {
      logger.error('Failed to add report job:', error);
      throw error;
    }
  }

  // Get job status
  async getJobStatus(jobId: string) {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress();

      return {
        id: job.id,
        type: job.name,
        data: job.data,
        state,
        progress,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        createdAt: job.timestamp,
      };
    } catch (error) {
      logger.error(`Failed to get job status for ${jobId}:`, error);
      throw error;
    }
  }

  // Get queue statistics
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  // Clean old jobs
  async cleanOldJobs(grace: number = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      await this.queue.clean(grace, 'completed');
      await this.queue.clean(grace, 'failed');
      logger.info('Cleaned old report jobs');
    } catch (error) {
      logger.error('Failed to clean old jobs:', error);
      throw error;
    }
  }

  private setupEventHandlers() {
    this.queue.on('completed', (job, result) => {
      logger.info(`Report job completed: ${job.id}`, { type: job.name });
    });

    this.queue.on('failed', (job, err) => {
      logger.error(`Report job failed: ${job.id}`, {
        type: job.name,
        error: err.message
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn(`Report job stalled: ${job.id}`, { type: job.name });
    });
  }

  // Graceful shutdown
  async close() {
    await this.queue.close();
  }
}

export const reportQueue = new ReportQueue();