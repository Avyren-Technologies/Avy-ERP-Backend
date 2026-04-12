import { platformPrisma } from '../../../config/database';
import { metaCloudProvider } from './whatsapp/meta-cloud.provider';
import { checkWhatsappCaps } from './whatsapp/caps';
import { maskForChannel } from '../templates/masker';
import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

function normalizeToE164(phone: string): string {
  if (phone.startsWith('+')) return phone;
  return `+91${phone.replace(/\D/g, '')}`;
}

/**
 * WhatsApp channel — Meta Cloud-backed.
 *
 * Pipeline:
 *   1. Load notification + user (recipient phone)
 *   2. Enforce template requirement (§4A.5 — Meta rejects free-form text
 *      outside the 24h session window, so every send must reference a
 *      pre-approved Meta Business template stored in
 *      `NotificationTemplate.whatsappTemplateName`)
 *   3. Tenant + user daily caps (§4A.4 cost controls)
 *   4. Mask sensitive fields for WHATSAPP channel
 *   5. Provider call (retries on 5xx/429)
 */
export const whatsappChannel = {
  async send({ notificationId, userId, traceId }: ChannelSendArgs): Promise<ChannelSendResult> {
    const notif = await platformPrisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    const user = await platformPrisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.phone) {
      throw Object.assign(new Error('NO_USER_PHONE'), { code: 'NO_USER_PHONE' });
    }

    const template = notif.templateId
      ? await platformPrisma.notificationTemplate.findUnique({
          where: { id: notif.templateId },
        })
      : null;

    if (!template?.whatsappTemplateName) {
      throw Object.assign(
        new Error(
          'WHATSAPP_TEMPLATE_REQUIRED: A pre-approved Meta Business template name is required',
        ),
        { code: 'WHATSAPP_TEMPLATE_REQUIRED' },
      );
    }

    const caps = await checkWhatsappCaps(notif.companyId ?? '', userId);
    if (!caps.allowed) {
      throw Object.assign(new Error(caps.reason ?? 'WHATSAPP_CAP_HIT'), {
        code: caps.reason ?? 'WHATSAPP_CAP_HIT',
      });
    }

    const sensitiveFields = (template.sensitiveFields as string[] | null) ?? [];
    const masked = maskForChannel(
      'WHATSAPP',
      {
        title: notif.title,
        body: notif.body,
        data: (notif.data as Record<string, unknown> | null) ?? undefined,
      },
      sensitiveFields,
    );

    const to = normalizeToE164(user.phone);
    // Guard against empty title producing leading "\n\n" in the body.
    const bodyText = [masked.title, masked.body].filter(Boolean).join('\n\n');

    const result = await metaCloudProvider.send(
      { to, body: bodyText, templateName: template.whatsappTemplateName },
      traceId,
    );
    return { provider: 'meta-cloud', messageId: result.messageId };
  },
};
