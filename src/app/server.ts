import { createServer } from 'http';
import { app } from './app';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { checkDatabaseConnection, disconnectDatabase } from '../config/database';
import { checkAllRedisConnections, disconnectRedis } from '../config/redis';
import { startSLACron } from '../workers/sla-cron';
import { initSocket } from '../lib/socket';
import { analyticsCronService } from '../modules/hr/analytics/services/analytics-cron.service';
import { startDemoResetCron } from '../workers/demo-reset-cron';
import { notificationService } from '../core/notifications/notification.service';
import { registerHRListeners } from '../shared/events/listeners/hr-listeners';

// Server startup function
async function startServer(): Promise<void> {
  try {
    // Check database connection
    logger.info('🔍 Checking database connection...');
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Check Redis connections
    logger.info('🔍 Checking Redis connections...');
    const redisConnected = await checkAllRedisConnections();
    if (!redisConnected) {
      throw new Error('Redis connection failed');
    }

    // Create HTTP server and attach Socket.io
    const httpServer = createServer(app);
    initSocket(httpServer);

    // Start HTTP server
    const server = httpServer.listen(env.PORT, '0.0.0.0', () => {
      logger.info(`🚀 Avy ERP Backend Server started successfully!`);
      logger.info(`📡 Server bound to host: 0.0.0.0`);
      logger.info(`📍 Server running on: http://localhost:${env.PORT}`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`📊 API Prefix: ${env.API_PREFIX}`);
      logger.info(`🏥 Health Check: http://localhost:${env.PORT}/health`);

      // Start SLA enforcement cron job
      startSLACron();

      // Start analytics cron jobs
      analyticsCronService.startAll();

      // Start demo tenant reset cron (daily at 2 AM)
      startDemoResetCron();

      // Initialize Firebase Admin for push notifications
      notificationService.initFirebase();

      // Register event listeners
      registerHRListeners();
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('❌ Server error:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('🛑 SIGTERM received, shutting down gracefully...');

      server.close(async () => {
        logger.info('✅ HTTP server closed');

        // Close database connections
        await disconnectDatabase();

        // Close Redis connections
        await disconnectRedis();

        logger.info('✅ All connections closed, exiting...');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });

    process.on('SIGINT', async () => {
      logger.info('🛑 SIGINT received, shutting down gracefully...');
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle startup
if (require.main === module) {
  startServer();
}

export { startServer };