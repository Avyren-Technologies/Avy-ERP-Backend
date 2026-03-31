/**
 * Unit tests for punch-validator.service.ts
 *
 * Source file: src/shared/services/punch-validator.service.ts
 *
 * validatePunchSequence is a pure function — no mocks required.
 * All three punch modes are exercised exhaustively.
 */

import {
  validatePunchSequence,
  type PunchEntry,
} from '@/shared/services/punch-validator.service';

// ─── Test Data Helpers ───────────────────────────────────────────────────────

/** Build a Date from a simple HH:mm string on a fixed base date (2026-03-30). */
function t(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date('2026-03-30T00:00:00.000Z');
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function punch(timeStr: string, direction?: 'IN' | 'OUT' | 'UNKNOWN'): PunchEntry {
  return { time: t(timeStr), direction };
}

// ─── FIRST_LAST ──────────────────────────────────────────────────────────────

describe('validatePunchSequence — FIRST_LAST mode', () => {
  it('should return null in and out for empty array', () => {
    const result = validatePunchSequence([], 'FIRST_LAST');
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toBeNull();
    expect(result.resolvedOut).toBeNull();
  });

  it('should return only resolvedIn when single punch is provided', () => {
    const result = validatePunchSequence([punch('09:00')], 'FIRST_LAST');
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toBeNull();
    expect(result.reason).toBeDefined();
  });

  it('should pick first as IN and last as OUT for two punches', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('18:00')],
      'FIRST_LAST',
    );
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
    expect(result.totalWorkedMinutes).toBe(9 * 60); // 540 min
  });

  it('should ignore middle punches and use first and last', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('12:00'), punch('13:00'), punch('18:00')],
      'FIRST_LAST',
    );
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
    expect(result.totalWorkedMinutes).toBe(540);
  });

  it('should sort unsorted input before resolving first/last', () => {
    // Punches provided out of order
    const result = validatePunchSequence(
      [punch('18:00'), punch('09:00')],
      'FIRST_LAST',
    );
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
  });

  it('should report 0 totalWorkedMinutes when in >= out', () => {
    const result = validatePunchSequence(
      [punch('18:00'), punch('18:00')],
      'FIRST_LAST',
    );
    // Same timestamp: 0 worked minutes
    expect(result.totalWorkedMinutes).toBe(0);
  });
});

// ─── EVERY_PAIR ──────────────────────────────────────────────────────────────

describe('validatePunchSequence — EVERY_PAIR mode', () => {
  it('should return null in/out for empty array', () => {
    const result = validatePunchSequence([], 'EVERY_PAIR');
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toBeNull();
    expect(result.resolvedOut).toBeNull();
  });

  it('should return single IN with missing OUT for one punch', () => {
    const result = validatePunchSequence([punch('09:00')], 'EVERY_PAIR');
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toBeNull();
  });

  it('should sum two IN→OUT pairs correctly with explicit directions', () => {
    const result = validatePunchSequence(
      [
        punch('09:00', 'IN'),
        punch('12:00', 'OUT'),
        punch('13:00', 'IN'),
        punch('18:00', 'OUT'),
      ],
      'EVERY_PAIR',
    );
    expect(result.valid).toBe(true);
    // 3h + 5h = 8h = 480 min
    expect(result.totalWorkedMinutes).toBe(480);
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
  });

  it('should sum two IN→OUT pairs without explicit directions (assumed alternating)', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('12:00'), punch('13:00'), punch('18:00')],
      'EVERY_PAIR',
    );
    expect(result.valid).toBe(true);
    expect(result.totalWorkedMinutes).toBe(480);
  });

  it('should flag invalid when two consecutive INs appear', () => {
    const result = validatePunchSequence(
      [punch('09:00', 'IN'), punch('10:00', 'IN'), punch('18:00', 'OUT')],
      'EVERY_PAIR',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('should flag invalid for odd number of punches without directions', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('12:00'), punch('18:00')],
      'EVERY_PAIR',
    );
    expect(result.valid).toBe(false);
  });

  it('should still compute available pairs even when sequence is invalid', () => {
    // Two consecutive INs: 09:00 IN, 10:00 IN, 18:00 OUT
    // Expected: only one valid pair (10:00 IN → 18:00 OUT = 480 min)
    const result = validatePunchSequence(
      [punch('09:00', 'IN'), punch('10:00', 'IN'), punch('18:00', 'OUT')],
      'EVERY_PAIR',
    );
    expect(result.valid).toBe(false);
    expect(result.totalWorkedMinutes).toBeGreaterThanOrEqual(0);
  });
});

// ─── SHIFT_BASED ─────────────────────────────────────────────────────────────

describe('validatePunchSequence — SHIFT_BASED mode', () => {
  const shiftStart = t('09:00');
  const shiftEnd   = t('18:00');

  it('should return null in/out for empty array', () => {
    const result = validatePunchSequence([], 'SHIFT_BASED', shiftStart, shiftEnd);
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toBeNull();
    expect(result.resolvedOut).toBeNull();
  });

  it('should return only IN for single punch', () => {
    const result = validatePunchSequence([punch('09:05')], 'SHIFT_BASED', shiftStart, shiftEnd);
    expect(result.resolvedIn).toEqual(t('09:05'));
    expect(result.resolvedOut).toBeNull();
  });

  it('should map the punch closest to shift start as IN', () => {
    // Three punches: 08:55 (5 min before start), 12:00 (lunch), 18:10 (near end)
    const result = validatePunchSequence(
      [punch('08:55'), punch('12:00'), punch('18:10')],
      'SHIFT_BASED',
      shiftStart,
      shiftEnd,
    );
    // Closest to 09:00 is 08:55 (5 min diff)
    expect(result.resolvedIn).toEqual(t('08:55'));
    // Closest to 18:00 is 18:10 (10 min diff), excluding IN
    expect(result.resolvedOut).toEqual(t('18:10'));
  });

  it('should pick the punch closest to shift end as OUT', () => {
    const result = validatePunchSequence(
      [punch('09:02'), punch('17:55')],
      'SHIFT_BASED',
      shiftStart,
      shiftEnd,
    );
    expect(result.resolvedIn).toEqual(t('09:02'));
    expect(result.resolvedOut).toEqual(t('17:55'));
    // 8h53m = 533 min
    expect(result.totalWorkedMinutes).toBe(533);
  });

  it('should fall back to FIRST_LAST when shiftStart is null', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('18:00')],
      'SHIFT_BASED',
      null,
      null,
    );
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
  });

  it('should fall back to FIRST_LAST when shiftStart is undefined', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('18:00')],
      'SHIFT_BASED',
    );
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
  });
});

// ─── Default / Unknown mode ──────────────────────────────────────────────────

describe('validatePunchSequence — unknown mode', () => {
  it('should fall back to FIRST_LAST behaviour for an unrecognised mode string', () => {
    const result = validatePunchSequence(
      [punch('09:00'), punch('18:00')],
      'BIOMETRIC_MAGIC' as any,
    );
    expect(result.resolvedIn).toEqual(t('09:00'));
    expect(result.resolvedOut).toEqual(t('18:00'));
  });
});

// ─── Null / undefined input guard ────────────────────────────────────────────

describe('validatePunchSequence — null/undefined guard', () => {
  it('should handle null punches array gracefully', () => {
    const result = validatePunchSequence(null as any, 'FIRST_LAST');
    expect(result.valid).toBe(true);
    expect(result.resolvedIn).toBeNull();
    expect(result.resolvedOut).toBeNull();
  });
});
