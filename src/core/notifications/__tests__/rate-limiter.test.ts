/**
 * Unit tests for dispatch rate limiter.
 *
 * Verifies:
 *   - CRITICAL priority bypasses both per-user and per-tenant limits
 *     (and emits the rate_limit_bypassed metric counter)
 *   - First INCR sets TTL
 *   - Exceeding the configured cap returns false
 *   - Redis errors fail-open (return true)
 */

const cacheMock = { incr: jest.fn(), expire: jest.fn() };
const metricsMock = { increment: jest.fn() };

jest.mock('../../../config/redis', () => ({ cacheRedis: cacheMock }));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../metrics/notification-metrics', () => ({
  notificationMetrics: metricsMock,
}));
jest.mock('../../../config/env', () => ({
  env: {
    NOTIFICATIONS_USER_RATE_LIMIT_PER_MIN: 20,
    NOTIFICATIONS_TENANT_RATE_LIMIT_PER_MIN: 100,
  },
}));

import { checkUserRateLimit, checkTenantRateLimit } from '../dispatch/rate-limiter';

beforeEach(() => {
  cacheMock.incr.mockReset();
  cacheMock.expire.mockReset();
  metricsMock.increment.mockReset();
});

describe('checkUserRateLimit', () => {
  test('CRITICAL bypass emits rate_limit_bypassed metric and returns true', async () => {
    const ok = await checkUserRateLimit('user1', 'CRITICAL');
    expect(ok).toBe(true);
    expect(metricsMock.increment).toHaveBeenCalledWith(
      'notifications.rate_limit_bypassed',
      expect.objectContaining({ scope: 'user', priority: 'CRITICAL' }),
    );
    expect(cacheMock.incr).not.toHaveBeenCalled();
  });

  test('sets TTL on first increment', async () => {
    cacheMock.incr.mockResolvedValue(1);
    cacheMock.expire.mockResolvedValue(1);
    await checkUserRateLimit('user1', 'MEDIUM');
    expect(cacheMock.expire).toHaveBeenCalledWith('notif:rate:user:user1', 60);
  });

  test('does not re-set TTL on subsequent increments', async () => {
    cacheMock.incr.mockResolvedValue(5);
    cacheMock.expire.mockResolvedValue(1);
    await checkUserRateLimit('user1', 'MEDIUM');
    expect(cacheMock.expire).not.toHaveBeenCalled();
  });

  test('returns false + rate_limited metric when cap exceeded', async () => {
    cacheMock.incr.mockResolvedValue(25);
    cacheMock.expire.mockResolvedValue(1);
    const ok = await checkUserRateLimit('user1', 'MEDIUM');
    expect(ok).toBe(false);
    expect(metricsMock.increment).toHaveBeenCalledWith(
      'notifications.rate_limited',
      expect.objectContaining({ scope: 'user' }),
    );
  });

  test('fail-open on Redis error', async () => {
    cacheMock.incr.mockRejectedValue(new Error('redis down'));
    const ok = await checkUserRateLimit('user1', 'MEDIUM');
    expect(ok).toBe(true);
  });
});

describe('checkTenantRateLimit', () => {
  test('CRITICAL bypass', async () => {
    const ok = await checkTenantRateLimit('co1', 'CRITICAL');
    expect(ok).toBe(true);
    expect(metricsMock.increment).toHaveBeenCalledWith(
      'notifications.rate_limit_bypassed',
      expect.objectContaining({ scope: 'tenant' }),
    );
  });

  test('returns false when tenant cap exceeded', async () => {
    cacheMock.incr.mockResolvedValue(101);
    cacheMock.expire.mockResolvedValue(1);
    const ok = await checkTenantRateLimit('co1', 'MEDIUM');
    expect(ok).toBe(false);
  });
});
