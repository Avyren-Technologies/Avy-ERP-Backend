/**
 * Unit tests for SMS daily caps (§4A.4 cost controls).
 *
 * Verifies:
 *   - Tenant cap checked before user cap
 *   - First INCR sets TTL
 *   - Exceeding returns { allowed: false, reason }
 *   - Redis errors fail-open
 */

const cacheMock = { incr: jest.fn(), expire: jest.fn() };
jest.mock('../../../config/redis', () => ({ cacheRedis: cacheMock }));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../config/env', () => ({
  env: {
    NOTIFICATIONS_SMS_DAILY_CAP_PER_TENANT: 100,
    NOTIFICATIONS_SMS_DAILY_CAP_PER_USER: 5,
  },
}));

import { checkSmsCaps } from '../channels/sms/caps';

beforeEach(() => {
  cacheMock.incr.mockReset();
  cacheMock.expire.mockReset();
});

test('happy path — under both caps', async () => {
  cacheMock.incr.mockResolvedValueOnce(10); // tenant
  cacheMock.incr.mockResolvedValueOnce(2);  // user
  const r = await checkSmsCaps('co1', 'u1');
  expect(r.allowed).toBe(true);
});

test('tenant cap exceeded → reason = SMS_TENANT_CAP, user counter NOT incremented', async () => {
  cacheMock.incr.mockResolvedValueOnce(101); // tenant
  const r = await checkSmsCaps('co1', 'u1');
  expect(r.allowed).toBe(false);
  expect(r.reason).toBe('SMS_TENANT_CAP');
  // Only the tenant incr should have fired — user counter is untouched
  expect(cacheMock.incr).toHaveBeenCalledTimes(1);
});

test('user cap exceeded → reason = SMS_USER_CAP', async () => {
  cacheMock.incr.mockResolvedValueOnce(50); // tenant OK
  cacheMock.incr.mockResolvedValueOnce(6);  // user exceeded
  const r = await checkSmsCaps('co1', 'u1');
  expect(r.allowed).toBe(false);
  expect(r.reason).toBe('SMS_USER_CAP');
});

test('sets TTL on first tenant + user INCR', async () => {
  cacheMock.incr.mockResolvedValueOnce(1);
  cacheMock.incr.mockResolvedValueOnce(1);
  await checkSmsCaps('co1', 'u1');
  const expireCalls = cacheMock.expire.mock.calls;
  expect(expireCalls).toHaveLength(2);
  expect(expireCalls[0][1]).toBe(48 * 3600);
  expect(expireCalls[1][1]).toBe(48 * 3600);
});

test('fail-open on Redis error', async () => {
  cacheMock.incr.mockRejectedValue(new Error('redis down'));
  const r = await checkSmsCaps('co1', 'u1');
  expect(r.allowed).toBe(true);
});
