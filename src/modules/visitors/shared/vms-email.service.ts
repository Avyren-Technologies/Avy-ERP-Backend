import { sendEmail } from '../../../infrastructure/email/email.service';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

const APP_URL = () => process.env.APP_URL || env.APP_URL || 'https://app.avyerp.com';
const APP_NAME = () => env.APP_NAME || 'Avy ERP';

/** Convert a data URL (data:image/png;base64,...) to a CID attachment + img tag. */
function dataUrlToCidAttachment(
  dataUrl: string | undefined | null,
  cid: string,
): { imgTag: string; attachment: { filename: string; content: Buffer; cid: string } } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const base64Data = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  return {
    imgTag: `<img src="cid:${cid}" alt="QR Code" style="width: 200px; height: 200px;" />`,
    attachment: { filename: 'qr-code.png', content: buffer, cid },
  };
}

/** Escape user-provided strings before interpolating into HTML. */
function esc(str: string | undefined | null): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Send visitor pre-registration invitation with QR code and visit details.
 */
export async function sendVisitorInvitation(data: {
  visitorEmail: string;
  visitorName: string;
  visitorCompany?: string | undefined;
  companyName: string;
  hostName?: string | undefined;
  visitDate: string;
  visitTime?: string | undefined;
  visitCode: string;
  qrCodeDataUrl?: string | undefined;
  purpose?: string | undefined;
  plantName?: string | undefined;
  specialInstructions?: string | undefined;
  safetyInduction?: {
    required: boolean;
    name?: string | undefined;
    type?: string | undefined; // VIDEO | SLIDES | QUESTIONNAIRE | DECLARATION
    contentUrl?: string | undefined;
  } | undefined;
  ndaRequired?: boolean | undefined;
}) {
  try {
    const preArrivalUrl = `${APP_URL()}/visit/${data.visitCode}`;
    const statusUrl = `${APP_URL()}/visit/${data.visitCode}/status`;

    const qrCid = dataUrlToCidAttachment(data.qrCodeDataUrl, 'visitqr@avyerp');
    const attachments = qrCid ? [qrCid.attachment] : [];

    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 32px 24px; border-radius: 16px 16px 0 0;">
          <h1 style="color: #ffffff; font-size: 22px; margin: 0 0 8px 0;">Visit Confirmation</h1>
          <p style="color: #E0E7FF; font-size: 14px; margin: 0;">${esc(data.companyName)}</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 24px 0;">
            Dear <strong>${esc(data.visitorName)}</strong>,<br/>
            Your visit to <strong>${esc(data.companyName)}</strong> has been confirmed.
          </p>

          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="color: #6B7280; padding: 4px 0;">Date</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${esc(data.visitDate)}</td></tr>
              ${data.visitTime ? `<tr><td style="color: #6B7280; padding: 4px 0;">Time</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${esc(data.visitTime)}</td></tr>` : ''}
              ${data.hostName ? `<tr><td style="color: #6B7280; padding: 4px 0;">Host</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${esc(data.hostName)}</td></tr>` : ''}
              ${data.purpose ? `<tr><td style="color: #6B7280; padding: 4px 0;">Purpose</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${esc(data.purpose)}</td></tr>` : ''}
              ${data.plantName ? `<tr><td style="color: #6B7280; padding: 4px 0;">Facility</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${esc(data.plantName)}</td></tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <div style="background: #EEF2FF; border: 2px solid #C7D2FE; border-radius: 12px; display: inline-block; padding: 20px;">
              ${qrCid ? qrCid.imgTag : ''}
              <p style="color: #4F46E5; font-size: 20px; font-weight: 700; letter-spacing: 4px; margin: 12px 0 4px 0;">${data.visitCode}</p>
              <p style="color: #6B7280; font-size: 12px; margin: 0;">Your Visit Code</p>
            </div>
          </div>

          <p style="color: #6B7280; font-size: 13px; text-align: center; margin-bottom: 20px;">
            Show this QR code at the gate for instant check-in.
          </p>

          <div style="margin-bottom: 24px;">
            <a href="${preArrivalUrl}" style="display: block; background: #4F46E5; color: #ffffff; text-decoration: none; text-align: center; padding: 14px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-bottom: 8px;">
              Complete Pre-Arrival Form
            </a>
            <a href="${statusUrl}" style="display: block; border: 1px solid #D1D5DB; color: #374151; text-decoration: none; text-align: center; padding: 14px; border-radius: 10px; font-weight: 600; font-size: 14px;">
              Check Visit Status
            </a>
          </div>

          ${data.specialInstructions ? `
            <div style="background: #FEF3C7; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
              <p style="color: #92400E; font-size: 12px; font-weight: 600; margin: 0 0 4px 0;">INSTRUCTIONS</p>
              <p style="color: #78350F; font-size: 13px; margin: 0;">${esc(data.specialInstructions)}</p>
            </div>
          ` : ''}

          ${data.safetyInduction?.required ? `
            <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #991B1B; font-size: 12px; font-weight: 700; margin: 0 0 8px 0; text-transform: uppercase;">Safety Induction Required</p>
              <p style="color: #7F1D1D; font-size: 13px; margin: 0 0 8px 0;">
                ${data.safetyInduction.name ? `<strong>${esc(data.safetyInduction.name)}</strong> — ` : ''}You must complete a safety induction before or upon arrival.
              </p>
              ${data.safetyInduction.type === 'DECLARATION' && data.safetyInduction.contentUrl ? `
                <div style="background: #ffffff; border-radius: 6px; padding: 12px; margin-top: 8px; border: 1px solid #E5E7EB;">
                  <p style="color: #374151; font-size: 12px; margin: 0; white-space: pre-wrap;">${esc(data.safetyInduction.contentUrl)}</p>
                </div>
              ` : ''}
              ${data.safetyInduction.type === 'VIDEO' || data.safetyInduction.type === 'SLIDES' ? `
                <a href="${preArrivalUrl}" style="display: inline-block; background: #DC2626; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 8px;">
                  Complete Induction Online
                </a>
              ` : ''}
              ${data.safetyInduction.type === 'QUESTIONNAIRE' ? `
                <p style="color: #7F1D1D; font-size: 12px; margin: 8px 0 0 0;">
                  A questionnaire must be completed — you can do this via the pre-arrival form or at the reception desk.
                </p>
              ` : ''}
            </div>
          ` : ''}

          ${data.ndaRequired ? `
            <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
              <p style="color: #1E40AF; font-size: 12px; font-weight: 700; margin: 0 0 4px 0; text-transform: uppercase;">NDA Required</p>
              <p style="color: #1E3A8A; font-size: 13px; margin: 0;">
                You will be required to review and sign a Non-Disclosure Agreement before or upon arrival.
              </p>
            </div>
          ` : ''}

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} ${data.companyName}. Powered by ${APP_NAME()}.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      data.visitorEmail,
      `Visit Confirmation — ${data.companyName} | ${data.visitDate}`,
      html,
      undefined,
      attachments.length > 0 ? attachments : undefined,
    );

    logger.info(`Visitor invitation email sent to ${data.visitorEmail} for visit ${data.visitCode}`);
  } catch (err) {
    logger.warn('Failed to send visitor invitation email', { error: err, visitCode: data.visitCode });
  }
}

/**
 * Send recurring pass details with QR code to the pass holder.
 */
export async function sendRecurringPassEmail(data: {
  visitorEmail: string;
  visitorName: string;
  visitorCompany: string;
  companyName: string;
  passNumber: string;
  passType: string;
  validFrom: string;
  validUntil: string;
  hostName?: string | undefined;
  purpose?: string | undefined;
  plantName?: string | undefined;
  qrCodeDataUrl?: string | undefined;
  allowedDays?: string | undefined;
  allowedTime?: string | undefined;
}) {
  try {
    const passQrCid = dataUrlToCidAttachment(data.qrCodeDataUrl, 'passqr@avyerp');
    const passAttachments = passQrCid ? [passQrCid.attachment] : [];

    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #059669, #10B981); padding: 32px 24px; border-radius: 16px 16px 0 0;">
          <h1 style="color: #ffffff; font-size: 22px; margin: 0 0 8px 0;">Recurring Visitor Pass</h1>
          <p style="color: #D1FAE5; font-size: 14px; margin: 0;">${esc(data.companyName)}</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 24px 0;">
            Dear <strong>${esc(data.visitorName)}</strong>,<br/>
            Your recurring visitor pass for <strong>${esc(data.companyName)}</strong> has been issued.
          </p>

          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="color: #6B7280; padding: 4px 0;">Pass Number</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.passNumber}</td></tr>
              <tr><td style="color: #6B7280; padding: 4px 0;">Pass Type</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.passType}</td></tr>
              <tr><td style="color: #6B7280; padding: 4px 0;">Valid From</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.validFrom}</td></tr>
              <tr><td style="color: #6B7280; padding: 4px 0;">Valid Until</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.validUntil}</td></tr>
              ${data.hostName ? `<tr><td style="color: #6B7280; padding: 4px 0;">Host</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.hostName}</td></tr>` : ''}
              ${data.purpose ? `<tr><td style="color: #6B7280; padding: 4px 0;">Purpose</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.purpose}</td></tr>` : ''}
              ${data.allowedDays ? `<tr><td style="color: #6B7280; padding: 4px 0;">Allowed Days</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.allowedDays}</td></tr>` : ''}
              ${data.allowedTime ? `<tr><td style="color: #6B7280; padding: 4px 0;">Allowed Time</td><td style="color: #111827; font-weight: 600; padding: 4px 0; text-align: right;">${data.allowedTime}</td></tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <div style="background: #ECFDF5; border: 2px solid #A7F3D0; border-radius: 12px; display: inline-block; padding: 20px;">
              ${passQrCid ? passQrCid.imgTag : ''}
              <p style="color: #059669; font-size: 18px; font-weight: 700; letter-spacing: 2px; margin: 12px 0 4px 0;">${data.passNumber}</p>
              <p style="color: #6B7280; font-size: 12px; margin: 0;">Show this QR at the gate for quick check-in</p>
            </div>
          </div>

          <div style="background: #FEF3C7; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <p style="color: #92400E; font-size: 12px; font-weight: 600; margin: 0 0 4px 0;">HOW TO USE</p>
            <p style="color: #78350F; font-size: 13px; margin: 0;">
              Show this QR code or pass number at the gate each time you visit. No re-registration needed — just scan and enter.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} ${data.companyName}. Powered by ${APP_NAME()}.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      data.visitorEmail,
      `Recurring Pass Issued — ${data.passNumber} | ${data.companyName}`,
      html,
      undefined,
      passAttachments.length > 0 ? passAttachments : undefined,
    );

    logger.info(`Recurring pass email sent to ${data.visitorEmail} for pass ${data.passNumber}`);
  } catch (err) {
    logger.warn('Failed to send recurring pass email', { error: err, passNumber: data.passNumber });
  }
}

/**
 * Send digital badge link to visitor after check-in.
 */
export async function sendDigitalBadgeEmail(data: {
  visitorEmail: string;
  visitorName: string;
  companyName: string;
  visitCode: string;
  badgeNumber?: string | undefined;
}) {
  try {
    const badgeUrl = `${APP_URL()}/visit/${data.visitCode}/badge`;

    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 24px; border-radius: 16px 16px 0 0;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0;">Your Digital Badge</h1>
          <p style="color: #E0E7FF; font-size: 13px; margin: 4px 0 0 0;">${esc(data.companyName)}</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 16px 16px; text-align: center;">
          <p style="color: #374151; font-size: 15px;">
            Welcome, <strong>${esc(data.visitorName)}</strong>! You have been checked in.
          </p>
          ${data.badgeNumber ? `<p style="color: #6B7280; font-size: 14px;">Badge: <strong style="color: #4F46E5;">${data.badgeNumber}</strong></p>` : ''}
          <a href="${badgeUrl}" style="display: inline-block; background: #4F46E5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 14px; margin: 16px 0;">
            View Digital Badge
          </a>
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 16px;">
            Keep this badge accessible on your phone during your visit.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      data.visitorEmail,
      `Digital Badge — ${data.companyName}`,
      html,
    );

    logger.info(`Digital badge email sent to ${data.visitorEmail} for visit ${data.visitCode}`);
  } catch (err) {
    logger.warn('Failed to send digital badge email', { error: err, visitCode: data.visitCode });
  }
}
