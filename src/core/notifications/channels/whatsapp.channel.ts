import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

/**
 * WhatsApp channel stub. Will be implemented when Meta Cloud API is wired up.
 */
export const whatsappChannel = {
  async send(_args: ChannelSendArgs): Promise<ChannelSendResult> {
    throw Object.assign(new Error('WhatsApp channel not implemented'), { code: 'WHATSAPP_NOT_IMPLEMENTED' });
  },
};
