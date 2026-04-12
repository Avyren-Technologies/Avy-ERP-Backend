import { platformPrisma } from '../../../config/database';
import { twilioProvider } from './sms/twilio.provider';
import { checkSmsCaps } from './sms/caps';
import { maskForChannel } from '../templates/masker';
import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

/**
 * Normalize a phone number to E.164 (Twilio's required format). Assumes
 * India (+91) as the default country code when no leading `+` is present.
 * Extend here for multi-region tenants.
 */
function normalizeToE164(phone: string): string {
  if (phone.startsWith('+')) return phone;
  return `+91${phone.replace(/\D/g, '')}`;
}

/**
 * SMS channel implementation — Twilio-backed.
 *
 * Pipeline order:
 *   1. Load notification + user (recipient phone)
 *   2. Enforce tenant + user daily caps (§4A.4 cost controls)
 *   3. Mask sensitive template fields for SMS channel
 *   4. Concatenate title + body (1600-char SMS hard limit)
 *   5. Provider call via `twilioProvider.send` (retries on transient errors)
 */
export const smsChannel = {
  async send({
    notificationId,
    userId,
    traceId,
    priority,
  }: ChannelSendArgs): Promise<ChannelSendResult> {
    const notif = await platformPrisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    const user = await platformPrisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.phone) {
      throw Object.assign(new Error('NO_USER_PHONE'), { code: 'NO_USER_PHONE' });
    }

    const caps = await checkSmsCaps(notif.companyId ?? '', userId);
    if (!caps.allowed) {
      throw Object.assign(new Error(caps.reason ?? 'SMS_CAP_HIT'), {
        code: caps.reason ?? 'SMS_CAP_HIT',
      });
    }

    const template = notif.templateId
      ? await platformPrisma.notificationTemplate.findUnique({
          where: { id: notif.templateId },
        })
      : null;
    const sensitiveFields = (template?.sensitiveFields as string[] | null) ?? [];

    const masked = maskForChannel(
      'SMS',
      {
        title: notif.title,
        body: notif.body,
        data: (notif.data as Record<string, unknown> | null) ?? undefined,
      },
      sensitiveFields,
    );

    const to = normalizeToE164(user.phone);
    // Guard against empty title producing ": body" output.
    const smsBody = (masked.title
      ? `${masked.title}: ${masked.body}`
      : masked.body
    ).slice(0, 1600);

    const result = await twilioProvider.send({ to, body: smsBody, priority }, traceId);
    return { provider: 'twilio', messageId: result.messageId };
  },
};
