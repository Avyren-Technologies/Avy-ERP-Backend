/**
 * Unit tests for consent gate — pure evaluation paths.
 *
 * `evaluateConsent` is the fast per-channel gate called inside the worker
 * loop after `loadConsentCache`. These tests target the gate logic in
 * isolation (no DB/Redis) to lock down the ordering rules and the
 * SYSTEM_CRITICAL / locked-category bypass behavior.
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {},
}));
jest.mock('../../../config/redis', () => ({
  cacheRedis: {},
}));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { evaluateConsent, type ConsentCache } from '../dispatch/consent-gate';

function makeCache(overrides: Partial<ConsentCache> = {}): ConsentCache {
  return {
    userId: 'user1',
    companySettings: {
      id: 'cs1',
      companyId: 'co1',
      inAppNotifications: true,
      pushNotifications: true,
      emailNotifications: true,
      smsNotifications: true,
      whatsappNotifications: true,
      timezone: 'UTC',
    } as never,
    preference: {
      id: 'up1',
      userId: 'user1',
      inAppEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      whatsappEnabled: true,
      deviceStrategy: 'ALL',
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    } as never,
    categoryPrefs: new Map(),
    ...overrides,
  };
}

describe('evaluateConsent', () => {
  test('IN_APP is always allowed, regardless of any gate', () => {
    const cache = makeCache({ companySettings: null });
    const r = evaluateConsent(cache, 'IN_APP', 'LOW');
    expect(r.allowed).toBe(true);
  });

  test('fails CLOSED when companySettings is missing for non-critical', () => {
    const cache = makeCache({ companySettings: null });
    const r = evaluateConsent(cache, 'PUSH', 'MEDIUM');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('NO_COMPANY_SETTINGS');
  });

  test('fails OPEN for CRITICAL when companySettings is missing', () => {
    const cache = makeCache({ companySettings: null });
    const r = evaluateConsent(cache, 'PUSH', 'CRITICAL');
    expect(r.allowed).toBe(true);
  });

  test('fails OPEN for systemCritical when companySettings is missing', () => {
    const cache = makeCache({ companySettings: null });
    const r = evaluateConsent(cache, 'EMAIL', 'LOW', { systemCritical: true });
    expect(r.allowed).toBe(true);
  });

  test('blocks when company master toggle for channel is off', () => {
    const cache = makeCache();
    (cache.companySettings as { pushNotifications: boolean }).pushNotifications = false;
    const r = evaluateConsent(cache, 'PUSH', 'MEDIUM');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('COMPANY_MASTER_OFF');
  });

  test('CRITICAL bypasses user preference off', () => {
    const cache = makeCache();
    (cache.preference as { pushEnabled: boolean }).pushEnabled = false;
    const r = evaluateConsent(cache, 'PUSH', 'CRITICAL');
    expect(r.allowed).toBe(true);
  });

  test('company master off is authoritative even for CRITICAL', () => {
    // Company can legally disable SMS/WhatsApp for compliance reasons even
    // for critical notifications — the master toggle wins.
    const cache = makeCache();
    (cache.companySettings as { pushNotifications: boolean }).pushNotifications = false;
    const r = evaluateConsent(cache, 'PUSH', 'CRITICAL');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('COMPANY_MASTER_OFF');
  });

  test('category override blocks when category+channel disabled', () => {
    const cache = makeCache();
    cache.categoryPrefs.set('LEAVE:EMAIL', false);
    const r = evaluateConsent(cache, 'EMAIL', 'MEDIUM', { category: 'LEAVE' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('CATEGORY_PREF_OFF');
  });

  test('locked category (AUTH) ignores user override', () => {
    const cache = makeCache();
    cache.categoryPrefs.set('AUTH:EMAIL', false);
    const r = evaluateConsent(cache, 'EMAIL', 'HIGH', { category: 'AUTH' });
    expect(r.allowed).toBe(true);
  });

  test('quiet hours suppress LOW/MEDIUM but allow HIGH', () => {
    const cache = makeCache();
    (cache.preference as {
      quietHoursEnabled: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
    }).quietHoursEnabled = true;
    (cache.preference as { quietHoursStart: string }).quietHoursStart = '00:00';
    (cache.preference as { quietHoursEnd: string }).quietHoursEnd = '23:59';

    const low = evaluateConsent(cache, 'EMAIL', 'LOW');
    expect(low.allowed).toBe(false);
    expect(low.reason).toBe('QUIET_HOURS');

    const high = evaluateConsent(cache, 'EMAIL', 'HIGH');
    expect(high.allowed).toBe(true);
  });
});
