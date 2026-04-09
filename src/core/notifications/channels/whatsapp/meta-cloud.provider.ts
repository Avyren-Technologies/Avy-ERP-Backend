import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';
import { withRetry } from '../provider-retry';

export interface MetaCloudPayload {
  to: string;
  body: string;
  /** Pre-approved Meta Business template name. Required — free-form text is
   *  rejected by Meta outside the 24h session window. */
  templateName: string;
}

export interface MetaCloudResult {
  provider: 'meta-cloud';
  messageId: string | null;
}

/** 5xx / 429 / connection errors = transient (retry). Everything else bubbles. */
function isTransientMetaError(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  if (e.status && e.status >= 500) return true;
  if (e.status === 429) return true;
  if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') return true;
  return false;
}

/**
 * Meta Cloud WhatsApp Business API provider.
 *
 * Uses `fetch` (global in Node 18+) to avoid adding another HTTP client
 * dependency. Body uses the v21.0 template message shape with a single
 * body-param slot carrying the rendered template text.
 */
export const metaCloudProvider = {
  async send(payload: MetaCloudPayload, traceId: string): Promise<MetaCloudResult> {
    if (!env.NOTIFICATIONS_WHATSAPP_ENABLED) {
      throw Object.assign(new Error('WHATSAPP_DISABLED'), { code: 'WHATSAPP_DISABLED' });
    }

    if (env.NOTIFICATIONS_WHATSAPP_DRY_RUN) {
      logger.info('[DRY-RUN] WhatsApp would have been sent', {
        traceId,
        to: payload.to,
        templateName: payload.templateName,
        body: payload.body,
      });
      return { provider: 'meta-cloud', messageId: 'dry-run' };
    }

    if (!env.META_WHATSAPP_PHONE_NUMBER_ID || !env.META_WHATSAPP_ACCESS_TOKEN) {
      throw Object.assign(new Error('WHATSAPP_NOT_CONFIGURED'), {
        code: 'WHATSAPP_NOT_CONFIGURED',
      });
    }

    const url = `https://graph.facebook.com/${env.META_WHATSAPP_API_VERSION}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to: payload.to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: payload.templateName,
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: payload.body }],
          },
        ],
      },
    };

    try {
      const json = await withRetry(
        async () => {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errText = await res.text();
            const err = Object.assign(
              new Error(`Meta Cloud API error ${res.status}: ${errText}`),
              { status: res.status },
            );
            throw err;
          }
          return (await res.json()) as { messages?: Array<{ id?: string }> };
        },
        { isRetryable: isTransientMetaError, maxAttempts: 3, baseDelayMs: 500 },
      );
      const messageId = json.messages?.[0]?.id ?? null;
      logger.info('WhatsApp sent', { traceId, to: payload.to, messageId });
      return { provider: 'meta-cloud', messageId };
    } catch (err) {
      const e = err as { message?: string };
      logger.error('Meta Cloud send failed (after retries)', { error: err, traceId });
      throw Object.assign(new Error(e.message ?? 'META_SEND_FAILED'), { code: 'META_SEND_FAILED' });
    }
  },
};
