import { platformPrisma } from '../../../config/database';
import { sendEmail } from '../../../infrastructure/email/email.service';
import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const emailChannel = {
  async send({ notificationId, userId }: ChannelSendArgs): Promise<ChannelSendResult> {
    const notif = await platformPrisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    const user = await platformPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.email) {
      throw Object.assign(new Error('NO_USER_EMAIL'), { code: 'NO_USER_EMAIL' });
    }

    const subject = notif.title;
    const bodyHtml = `<p>${escapeHtml(notif.body)}</p>${
      notif.actionUrl ? `<p><a href="${escapeHtml(notif.actionUrl)}">Open</a></p>` : ''
    }`;

    await sendEmail(user.email, subject, bodyHtml, notif.body);

    return { provider: 'smtp', messageId: null };
  },
};
