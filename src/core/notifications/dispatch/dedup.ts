import crypto from 'crypto';
import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

export interface DedupInput {
  companyId: string;
  triggerEvent: string;
  entityType?: string | undefined;
  entityId?: string | undefined;
  recipientId: string;
  payload: { title: string; body: string; data?: unknown };
}

/**
 * Stable JSON stringify with sorted object keys for deterministic hashing.
 * Without this, `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` would hash differently.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function computeDedupHash(p: DedupInput['payload']): string {
  const canonical = stableStringify({ t: p.title, b: p.body, d: p.data ?? null });
  return crypto.createHash('sha1').update(canonical).digest('hex');
}

/**
 * Returns true if this notification was already dispatched within the TTL window.
 * Uses SET NX with an expiry to atomically check-and-set.
 * Fails open on Redis error — we'd rather duplicate than drop.
 */
export async function checkDedup(input: DedupInput): Promise<boolean> {
  try {
    const hash = computeDedupHash(input.payload);
    const key = `notif:dedup:${input.companyId}:${input.triggerEvent}:${input.entityType ?? '_'}:${input.entityId ?? '_'}:${input.recipientId}:${hash}`;
    const result = await cacheRedis.set(key, '1', 'EX', env.NOTIFICATIONS_DEDUP_TTL_SEC, 'NX');
    return result === null; // null means key already existed
  } catch (err) {
    logger.warn('Dedup check failed (fail-open)', { error: err });
    return false;
  }
}
