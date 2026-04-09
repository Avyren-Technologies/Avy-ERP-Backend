import type { ChannelSendArgs, ChannelSendResult } from './channel-router';

/**
 * IN_APP is written by the dispatcher before the worker runs.
 * The worker only needs to record the SENT event. This no-op confirms delivery.
 */
export const inAppChannel = {
  async send(_args: ChannelSendArgs): Promise<ChannelSendResult> {
    return { provider: 'in-app', messageId: null };
  },
};
