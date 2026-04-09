import type { NotificationChannel } from '@prisma/client';

export interface MaskablePayload {
  title: string;
  body: string;
  data?: unknown;
}

/**
 * Channels where sensitive fields are masked with `***`.
 *
 * PUSH — delivered to lock screens, visible to bystanders
 * SMS — delivered as plaintext, often seen in notification previews
 * WHATSAPP — delivered as plaintext, same concern
 *
 * IN_APP and EMAIL keep full content (in-app is the system of record;
 * email is typically private to the recipient's inbox).
 */
const MASKED_CHANNELS: NotificationChannel[] = ['PUSH', 'SMS', 'WHATSAPP'];

/**
 * Mask sensitive fields for the given channel.
 *
 * Semantics:
 *   - IN_APP / EMAIL: no masking (full text delivered)
 *   - PUSH / SMS / WHATSAPP: sensitiveFields are replaced with '***' in
 *     title, body, and data
 *
 * In-app rows are always unmasked (system of record). Users open the app
 * to see the actual values.
 */
export function maskForChannel<T extends MaskablePayload>(
  channel: NotificationChannel,
  payload: T,
  sensitiveFields: string[],
): T {
  if (!MASKED_CHANNELS.includes(channel) || sensitiveFields.length === 0) return payload;

  const dataObj: Record<string, unknown> = {
    ...((payload.data as Record<string, unknown> | undefined) ?? {}),
  };

  const maskInString = (s: string): string => {
    let out = s;
    for (const field of sensitiveFields) {
      const value = dataObj[field];
      if (value !== undefined && value !== null) {
        const str = String(value);
        if (str.length > 0) out = out.split(str).join('***');
      }
    }
    return out;
  };

  const maskedData: Record<string, unknown> = { ...dataObj };
  for (const field of sensitiveFields) {
    if (maskedData[field] !== undefined) maskedData[field] = '***';
  }

  return {
    ...payload,
    title: maskInString(payload.title),
    body: maskInString(payload.body),
    data: maskedData,
  };
}
