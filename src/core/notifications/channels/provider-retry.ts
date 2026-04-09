import { logger } from '../../../config/logger';

export interface RetryOpts {
  /** Max attempts including the first. Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms before the second attempt. Default: 500. */
  baseDelayMs?: number;
  /** Cap on delay growth. Default: 10s. */
  maxDelayMs?: number;
  /**
   * Predicate that decides whether an error is worth retrying.
   * Default: always retry.
   *
   * For real providers, return true only on transient errors (5xx, 429,
   * connection resets) and false on permanent errors (auth failures,
   * bad phone numbers, template errors).
   */
  isRetryable?: (err: unknown) => boolean;
}

/**
 * Generic retry wrapper for external provider calls (Twilio, Meta Cloud, FCM).
 *
 * - Exponential backoff: `baseDelayMs * 4^(attempt-1)`, capped at `maxDelayMs`
 * - Only retries when `isRetryable(err)` returns true
 * - Stops at `maxAttempts` and re-throws the last error
 *
 * Use for provider HTTP calls; BullMQ worker-level retry catches anything
 * that survives this (e.g. consistent provider outages).
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const cap = opts.maxDelayMs ?? 10_000;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt === max || !isRetryable(err)) {
        throw err;
      }
      const delay = Math.min(base * Math.pow(4, attempt - 1), cap);
      logger.info('Provider retry', {
        attempt,
        maxAttempts: max,
        delay,
        error: (err as Error)?.message,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable — loop always either returns or throws. Re-throw for TS.
  throw lastError ?? new Error('withRetry: unreachable');
}
