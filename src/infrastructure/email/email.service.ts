import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

let transporter: Transporter | null = null;

/**
 * Initialize the email transporter.
 * Uses SMTP config if available, otherwise falls back to Ethereal for development.
 */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    logger.info('Email transporter initialized with SMTP config');
  } else {
    // Development fallback: Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    logger.info(`Email transporter initialized with Ethereal test account: ${testAccount.user}`);
  }

  return transporter;
}

/**
 * Send a generic email.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<void> {
  try {
    const transport = await getTransporter();

    const info = await transport.sendMail({
      from: `"${env.FROM_NAME}" <${env.FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    logger.info(`Email sent to ${to}: ${info.messageId}`);

    // Log Ethereal preview URL in development
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Ethereal preview URL: ${previewUrl}`);
    }
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
}

/**
 * Send a password reset code email.
 */
export async function sendPasswordResetCode(
  to: string,
  code: string,
  firstName: string
): Promise<void> {
  const subject = `${env.APP_NAME} — Password Reset Code`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #4A3AFF; margin-bottom: 24px;">${env.APP_NAME}</h2>
      <p>Hi ${firstName},</p>
      <p>You requested a password reset. Use the code below to verify your identity:</p>
      <div style="background: #F3F0FF; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4A3AFF;">${code}</span>
      </div>
      <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} Avyren Technologies. All rights reserved.</p>
    </div>
  `;

  await sendEmail(to, subject, html);
}
