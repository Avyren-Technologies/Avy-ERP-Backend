export interface MaskablePayload {
  title: string;
  body: string;
  data?: unknown;
}

/**
 * Mask sensitive fields for the given channel.
 *
 * Semantics:
 *   - IN_APP / EMAIL / SMS / WHATSAPP: no masking (full text delivered)
 *   - PUSH: sensitiveFields are replaced with '***' in title, body, and data
 *
 * In-app rows are always unmasked (system of record). Users open the app
 * to see the actual values.
 */
export function maskForChannel<T extends MaskablePayload>(
  channel: 'PUSH' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP',
  payload: T,
  sensitiveFields: string[],
): T {
  if (channel !== 'PUSH' || sensitiveFields.length === 0) return payload;

  const dataObj: Record<string, unknown> = { ...((payload.data as Record<string, unknown> | undefined) ?? {}) };

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
