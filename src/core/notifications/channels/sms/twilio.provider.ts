import twilio, { Twilio } from 'twilio';
import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';
import { withRetry } from '../provider-retry';
import type { NotificationPriority } from '@prisma/client';

let client: Twilio | null = null;

function getClient(): Twilio | null {
  if (client) return client;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
}

export interface TwilioSendPayload {
  to: string;
  body: string;
  priority: NotificationPriority;
}

export interface TwilioSendResult {
  provider: 'twilio';
  messageId: string | null;
}

/**
 * Transient errors worth retrying. Non-retryable errors (auth, bad phone)
 * bubble immediately so BullMQ doesn't spin forever on permanent failures.
 *
 * Twilio error codes: https://www.twilio.com/docs/api/errors
 */
function isTransientTwilioError(err: unknown): boolean {
  const e = err as { status?: number; code?: number | string };
  if (e.status === 503 || e.status === 429) return true;
  if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') return true;
  // 20429 = too many requests
  if (e.code === 20429) return true;
  return false;
}

/**
 * Low-level Twilio send wrapper. Handles:
 *   - kill-switch (NOTIFICATIONS_SMS_ENABLED)
 *   - dry-run mode (NOTIFICATIONS_SMS_DRY_RUN)
 *   - client lazy-init
 *   - messaging-service-sid vs from-number selection
 *   - exponential backoff retry on transient errors
 *
 * Cost caps + masking happen at the channel layer, not here.
 */
export const twilioProvider = {
  async send(payload: TwilioSendPayload, traceId: string): Promise<TwilioSendResult> {
    if (!env.NOTIFICATIONS_SMS_ENABLED) {
      throw Object.assign(new Error('SMS_DISABLED'), { code: 'SMS_DISABLED' });
    }

    if (env.NOTIFICATIONS_SMS_DRY_RUN) {
      logger.info('[DRY-RUN] SMS would have been sent', {
        traceId,
        to: payload.to,
        body: payload.body,
      });
      return { provider: 'twilio', messageId: 'dry-run' };
    }

    const c = getClient();
    if (!c) {
      throw Object.assign(new Error('TWILIO_NOT_CONFIGURED'), { code: 'TWILIO_NOT_CONFIGURED' });
    }
    if (!env.TWILIO_FROM_NUMBER && !env.TWILIO_MESSAGING_SERVICE_SID) {
      throw Object.assign(new Error('TWILIO_NO_SENDER'), { code: 'TWILIO_NO_SENDER' });
    }

    try {
      const message = await withRetry(
        () =>
          c.messages.create({
            body: payload.body,
            to: payload.to,
            ...(env.TWILIO_MESSAGING_SERVICE_SID
              ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
              : { from: env.TWILIO_FROM_NUMBER! }),
          }),
        { isRetryable: isTransientTwilioError, maxAttempts: 3, baseDelayMs: 500 },
      );
      logger.info('SMS sent', { traceId, to: payload.to, sid: message.sid });
      return { provider: 'twilio', messageId: message.sid };
    } catch (err) {
      const e = err as { code?: string | number; message?: string };
      logger.error('Twilio send failed (after retries)', { error: err, traceId, to: payload.to });
      throw Object.assign(new Error(e.message ?? 'TWILIO_SEND_FAILED'), {
        code: e.code ?? 'TWILIO_SEND_FAILED',
      });
    }
  },
};
