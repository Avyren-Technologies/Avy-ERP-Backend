import { env } from '../../config/env';
import { sendEmail } from './email.service';
import { logger } from '../../config/logger';

/**
 * Notify super admin of a new company registration request.
 */
export async function sendRegistrationNotification(data: {
  companyName: string;
  adminName: string;
  email: string;
  phone: string;
  requestId: string;
}): Promise<void> {
  const adminEmail = env.SUPER_ADMIN_EMAIL;
  if (!adminEmail) {
    logger.warn('SUPER_ADMIN_EMAIL not configured, skipping registration notification');
    return;
  }

  const subject = `${env.APP_NAME} — New Company Registration: ${data.companyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #4A3AFF; margin-bottom: 24px;">${env.APP_NAME}</h2>
      <p>A new company registration request has been submitted.</p>
      <div style="background: #F8F7FF; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Company:</strong> ${data.companyName}</p>
        <p style="margin: 4px 0;"><strong>Contact:</strong> ${data.adminName}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> ${data.email}</p>
        <p style="margin: 4px 0;"><strong>Phone:</strong> ${data.phone}</p>
      </div>
      <p>Review this request in the admin panel:</p>
      <a href="https://admin.${env.MAIN_DOMAIN}/app/registration-requests/${data.requestId}"
         style="display:inline-block;background:#4A3AFF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Review Request
      </a>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} Avyren Technologies. All rights reserved.</p>
    </div>
  `;

  await sendEmail(adminEmail, subject, html);
}

/**
 * Notify company admin that their registration was approved.
 */
export async function sendRegistrationApproved(data: {
  email: string;
  adminName: string;
  companyName: string;
  slug: string;
  tempPassword: string;
}): Promise<void> {
  const subject = `Welcome to ${env.APP_NAME} — Your Account is Ready`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #4A3AFF; margin-bottom: 24px;">${env.APP_NAME}</h2>
      <p>Hi ${data.adminName},</p>
      <p>Your company <strong>"${data.companyName}"</strong> has been approved!</p>
      <div style="background: #F0FDF4; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Your ERP URL:</strong></p>
        <a href="https://${data.slug}.${env.MAIN_DOMAIN}" style="color: #4A3AFF; font-size: 16px;">
          https://${data.slug}.${env.MAIN_DOMAIN}
        </a>
        <p style="margin: 12px 0 4px 0;"><strong>Login Email:</strong> ${data.email}</p>
        <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${data.tempPassword}</p>
      </div>
      <p style="color: #666; font-size: 14px;">Please change your password after first login.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} Avyren Technologies. All rights reserved.</p>
    </div>
  `;

  await sendEmail(data.email, subject, html);
}

/**
 * Notify applicant that their registration was rejected.
 */
export async function sendRegistrationRejected(data: {
  email: string;
  adminName: string;
  companyName: string;
  rejectionReason: string;
}): Promise<void> {
  const subject = `${env.APP_NAME} — Registration Update`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #4A3AFF; margin-bottom: 24px;">${env.APP_NAME}</h2>
      <p>Hi ${data.adminName},</p>
      <p>Thank you for your interest in ${env.APP_NAME}.</p>
      <p>Unfortunately, your registration for <strong>"${data.companyName}"</strong> could not be approved at this time.</p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Reason:</strong> ${data.rejectionReason}</p>
      </div>
      <p style="color: #666; font-size: 14px;">If you have questions, contact <a href="mailto:support@avyren.in">support@avyren.in</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} Avyren Technologies. All rights reserved.</p>
    </div>
  `;

  await sendEmail(data.email, subject, html);
}
