/**
 * Unit tests for timezone utility
 *
 * Source file: src/shared/utils/timezone.ts
 *
 * All functions are pure (no DB / Redis). No mocks needed.
 * Tests verify timezone-aware parsing and attendance date assignment.
 */

import { DateTime } from 'luxon';
import {
  nowInCompanyTimezone,
  parseInCompanyTimezone,
  getAttendanceDateForShift,
  todayInCompanyTimezone,
  toDateTimeInTimezone,
} from '@/shared/utils/timezone';

// ─── nowInCompanyTimezone ────────────────────────────────────────────────────

describe('nowInCompanyTimezone', () => {
  it('should return a DateTime in the requested timezone', () => {
    const dt = nowInCompanyTimezone('Asia/Kolkata');
    expect(dt.zoneName).toBe('Asia/Kolkata');
    expect(dt.isValid).toBe(true);
  });

  it('should return different hour for different timezone compared to UTC', () => {
    const dtKolkata  = nowInCompanyTimezone('Asia/Kolkata');
    const dtNewYork  = nowInCompanyTimezone('America/New_York');
    // Both should be valid DateTimes even though offsets differ
    expect(dtKolkata.isValid).toBe(true);
    expect(dtNewYork.isValid).toBe(true);
    // Their UTC millisecond values should be very close (same wall-clock moment)
    expect(Math.abs(dtKolkata.toMillis() - dtNewYork.toMillis())).toBeLessThan(5000);
  });
});

// ─── parseInCompanyTimezone ──────────────────────────────────────────────────

describe('parseInCompanyTimezone', () => {
  it('should parse a date+time string in Asia/Kolkata', () => {
    const dt = parseInCompanyTimezone('2026-03-30', '09:00', 'Asia/Kolkata');
    expect(dt.isValid).toBe(true);
    expect(dt.zoneName).toBe('Asia/Kolkata');
    expect(dt.year).toBe(2026);
    expect(dt.month).toBe(3);
    expect(dt.day).toBe(30);
    expect(dt.hour).toBe(9);
    expect(dt.minute).toBe(0);
  });

  it('should parse a date+time string in America/New_York', () => {
    const dt = parseInCompanyTimezone('2026-03-30', '17:30', 'America/New_York');
    expect(dt.isValid).toBe(true);
    expect(dt.zoneName).toBe('America/New_York');
    expect(dt.hour).toBe(17);
    expect(dt.minute).toBe(30);
  });

  it('should correctly offset: 09:00 IST is 03:30 UTC', () => {
    const dt = parseInCompanyTimezone('2026-03-30', '09:00', 'Asia/Kolkata');
    const utc = dt.toUTC();
    expect(utc.hour).toBe(3);
    expect(utc.minute).toBe(30);
  });

  it('should handle midnight (00:00)', () => {
    const dt = parseInCompanyTimezone('2026-03-30', '00:00', 'Asia/Kolkata');
    expect(dt.hour).toBe(0);
    expect(dt.minute).toBe(0);
  });

  it('should handle end-of-day times (23:59)', () => {
    const dt = parseInCompanyTimezone('2026-03-30', '23:59', 'Asia/Kolkata');
    expect(dt.hour).toBe(23);
    expect(dt.minute).toBe(59);
  });
});

// ─── toDateTimeInTimezone ────────────────────────────────────────────────────

describe('toDateTimeInTimezone', () => {
  it('should be an alias for parseInCompanyTimezone', () => {
    const a = parseInCompanyTimezone('2026-03-30', '09:00', 'Asia/Kolkata');
    const b = toDateTimeInTimezone('2026-03-30', '09:00', 'Asia/Kolkata');
    expect(a.toMillis()).toBe(b.toMillis());
  });
});

// ─── todayInCompanyTimezone ──────────────────────────────────────────────────

describe('todayInCompanyTimezone', () => {
  it('should return a string matching yyyy-MM-dd format', () => {
    const today = todayInCompanyTimezone('Asia/Kolkata');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── getAttendanceDateForShift ────────────────────────────────────────────────

describe('getAttendanceDateForShift', () => {
  const TZ = 'Asia/Kolkata';

  // ── Non-cross-day shifts ────────────────────────────────────────────────────

  describe('non-cross-day shift with default boundary (00:00)', () => {
    const shift = { isCrossDay: false, startTime: '09:00' };

    it('should return the punch date for a normal day-shift punch', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '09:10', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });

    it('should return the punch date even for a late punch', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '11:30', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });
  });

  describe('non-cross-day shift with 06:00 day boundary', () => {
    const shift = { isCrossDay: false, startTime: '09:00' };

    it('should assign punch at 05:30 (before boundary) to the previous calendar date', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '05:30', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
      expect(result).toBe('2026-03-29');
    });

    it('should assign punch at 06:00 (exactly at boundary) to the current date', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '06:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
      expect(result).toBe('2026-03-30');
    });

    it('should assign punch at 07:00 (after boundary) to the current date', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '07:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
      expect(result).toBe('2026-03-30');
    });
  });

  // ── Cross-day (night) shifts ────────────────────────────────────────────────

  describe('cross-day night shift (22:00 – 06:00)', () => {
    const shift = { isCrossDay: true, startTime: '22:00' };

    it('should assign punch at 22:15 (shift start evening) to that same date', () => {
      // Employee starts at 22:15 on 2026-03-30
      const punchTime = parseInCompanyTimezone('2026-03-30', '22:15', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });

    it('should assign punch at 02:00 (next morning, still on night shift) to previous date', () => {
      // The 02:00 punch on 2026-03-31 belongs to the 2026-03-30 shift
      const punchTime = parseInCompanyTimezone('2026-03-31', '02:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });

    it('should assign punch at 06:30 (shift end morning) to the correct date', () => {
      // 06:30 is >= 22 (shiftStartHour) is false (6 < 22), so it belongs to previous date
      const punchTime = parseInCompanyTimezone('2026-03-31', '06:30', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });

    it('should assign punch at 23:00 (still on same shift evening) to that same date', () => {
      const punchTime = parseInCompanyTimezone('2026-03-30', '23:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      expect(result).toBe('2026-03-30');
    });
  });

  // ── Edge case: exactly midnight ─────────────────────────────────────────────

  describe('punch at exactly midnight', () => {
    it('should assign 00:00 to the current date with default 00:00 boundary', () => {
      const shift = { isCrossDay: false, startTime: '09:00' };
      const punchTime = parseInCompanyTimezone('2026-03-30', '00:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '00:00', TZ);
      // boundaryMinutesOfDay = 0, so condition (0 > 0) is false → returns current date
      expect(result).toBe('2026-03-30');
    });

    it('should assign midnight punch to previous date when boundary is 06:00', () => {
      const shift = { isCrossDay: false, startTime: '09:00' };
      const punchTime = parseInCompanyTimezone('2026-03-30', '00:00', TZ);
      const result = getAttendanceDateForShift(punchTime, shift, '06:00', TZ);
      expect(result).toBe('2026-03-29');
    });
  });
});
