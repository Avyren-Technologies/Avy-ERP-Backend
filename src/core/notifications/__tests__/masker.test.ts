/**
 * Unit tests for channel-aware sensitive field masker.
 *
 * Verifies that PUSH / SMS / WHATSAPP mask the sensitive values (in title,
 * body, and data) while IN_APP and EMAIL pass through unchanged.
 */

import { maskForChannel } from '../templates/masker';

const payload = {
  title: 'Your OTP is 123456',
  body: 'Use code 123456 to reset your password',
  data: { reset_code: '123456', user_name: 'Alice' },
};
const sensitive = ['reset_code'];

describe('maskForChannel', () => {
  test('IN_APP is never masked', () => {
    const out = maskForChannel('IN_APP', payload, sensitive);
    expect(out.body).toContain('123456');
    expect((out.data as Record<string, unknown>).reset_code).toBe('123456');
  });

  test('EMAIL is never masked', () => {
    const out = maskForChannel('EMAIL', payload, sensitive);
    expect(out.body).toContain('123456');
    expect((out.data as Record<string, unknown>).reset_code).toBe('123456');
  });

  test('PUSH masks all occurrences of sensitive values', () => {
    const out = maskForChannel('PUSH', payload, sensitive);
    expect(out.title).not.toContain('123456');
    expect(out.title).toContain('***');
    expect(out.body).not.toContain('123456');
    expect((out.data as Record<string, unknown>).reset_code).toBe('***');
  });

  test('SMS masks all occurrences of sensitive values', () => {
    const out = maskForChannel('SMS', payload, sensitive);
    expect(out.body).not.toContain('123456');
    expect((out.data as Record<string, unknown>).reset_code).toBe('***');
  });

  test('WHATSAPP masks all occurrences of sensitive values', () => {
    const out = maskForChannel('WHATSAPP', payload, sensitive);
    expect(out.body).not.toContain('123456');
    expect((out.data as Record<string, unknown>).reset_code).toBe('***');
  });

  test('empty sensitiveFields is a pass-through', () => {
    const out = maskForChannel('PUSH', payload, []);
    expect(out.body).toBe(payload.body);
  });

  test('non-sensitive data keys are preserved', () => {
    const out = maskForChannel('PUSH', payload, sensitive);
    expect((out.data as Record<string, unknown>).user_name).toBe('Alice');
  });
});
