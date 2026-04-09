import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

/**
 * SMS channel stub. Will be implemented when a provider (Twilio/MSG91) is wired up.
 * Throws NotImplemented so the worker records FAILED and the admin knows.
 */
export const smsChannel = {
  async send(_args: ChannelSendArgs): Promise<ChannelSendResult> {
    throw Object.assign(new Error('SMS channel not implemented'), { code: 'SMS_NOT_IMPLEMENTED' });
  },
};
