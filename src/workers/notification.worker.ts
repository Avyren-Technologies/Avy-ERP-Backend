import Queue from 'bull';
import nodemailer from 'nodemailer';
import { logger } from '../config/logger';
import { getBullQueueConfig } from '../config/redis';
import { env } from '../config/env';

// Create notification queue
const notificationQueue = new Queue('notifications', getBullQueueConfig('notifications'));

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER && env.SMTP_PASS ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

// Email notification job
notificationQueue.process('send-email', async (job) => {
  const { to, subject, html, text, from } = job.data;

  logger.info(`Sending email to: ${to}`, { subject, jobId: job.id });

  try {
    const mailOptions = {
      from: from || `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    };

    const result = await emailTransporter.sendMail(mailOptions);

    logger.info(`Email sent successfully: ${result.messageId}`);

    return { messageId: result.messageId, status: 'sent' };
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
});

// SMS notification job (placeholder - would integrate with SMS provider)
notificationQueue.process('send-sms', async (job) => {
  const { to, message } = job.data;

  logger.info(`Sending SMS to: ${to}`, { jobId: job.id });

  try {
    // TODO: Integrate with actual SMS provider (Twilio, AWS SNS, etc.)
    if (!env.SMS_API_KEY) {
      logger.warn('SMS API key not configured, skipping SMS send');
      return { status: 'skipped', reason: 'SMS not configured' };
    }

    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.info(`SMS sent successfully to: ${to}`);

    return { status: 'sent' };
  } catch (error) {
    logger.error(`Failed to send SMS to ${to}:`, error);
    throw error;
  }
});

// Push notification job (placeholder - would integrate with FCM/APNs)
notificationQueue.process('send-push', async (job) => {
  const { userId, title, body, data } = job.data;

  logger.info(`Sending push notification to user: ${userId}`, { title, jobId: job.id });

  try {
    // TODO: Integrate with Firebase Cloud Messaging or Apple Push Notification service
    // For now, just log the notification

    logger.info(`Push notification sent to user ${userId}: ${title}`);

    return { status: 'sent' };
  } catch (error) {
    logger.error(`Failed to send push notification to user ${userId}:`, error);
    throw error;
  }
});

// Bulk notification job
notificationQueue.process('send-bulk-email', async (job) => {
  const { recipients, subject, html, text } = job.data;

  logger.info(`Sending bulk email to ${recipients.length} recipients`, { subject, jobId: job.id });

  try {
    const results = [];

    // Send emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const promises = batch.map((recipient: string) =>
        notificationQueue.add('send-email', {
          to: recipient,
          subject,
          html,
          text,
        })
      );

      await Promise.all(promises);
      results.push(...batch);
    }

    logger.info(`Bulk email jobs queued for ${results.length} recipients`);

    return { recipients: results.length, status: 'queued' };
  } catch (error) {
    logger.error(`Failed to queue bulk emails:`, error);
    throw error;
  }
});

// Queue event handlers
notificationQueue.on('completed', (job, result) => {
  logger.info(`Notification job completed: ${job.id}`, { type: job.name, result });
});

notificationQueue.on('failed', (job, err) => {
  logger.error(`Notification job failed: ${job.id}`, { type: job.name, error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Notification worker shutting down...');
  await notificationQueue.close();
  if (emailTransporter) {
    emailTransporter.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Notification worker shutting down...');
  await notificationQueue.close();
  if (emailTransporter) {
    emailTransporter.close();
  }
  process.exit(0);
});

logger.info('Notification worker started and listening for jobs...');

// Export for testing
export { notificationQueue };
