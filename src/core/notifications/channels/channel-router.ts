import type { NotificationChannel, NotificationPriority } from '@prisma/client';
import { inAppChannel } from './in-app.channel';
import { pushChannel } from './push/push.channel';
import { emailChannel } from './email.channel';
import { smsChannel } from './sms.channel';
import { whatsappChannel } from './whatsapp.channel';

export interface ChannelSendArgs {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  traceId: string;
  priority: NotificationPriority;
}

export interface ChannelSendResult {
  provider: string;
  messageId?: string | null;
  expoTicketId?: string | null;
  deadTokens?: string[];
}

export const channelRouter = {
  async send(args: ChannelSendArgs): Promise<ChannelSendResult> {
    switch (args.channel) {
      case 'IN_APP':
        return inAppChannel.send(args);
      case 'PUSH':
        return pushChannel.send(args);
      case 'EMAIL':
        return emailChannel.send(args);
      case 'SMS':
        return smsChannel.send(args);
      case 'WHATSAPP':
        return whatsappChannel.send(args);
      default:
        throw Object.assign(new Error(`Unknown channel: ${args.channel}`), { code: 'UNKNOWN_CHANNEL' });
    }
  },
};
