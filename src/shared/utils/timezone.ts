/**
 * Timezone Utility
 *
 * All attendance date/time calculations must use the company timezone,
 * never server-local time. These helpers wrap Luxon's DateTime for
 * timezone-aware operations.
 *
 * NOTE: Requires `luxon` as a dependency. If not already installed:
 *   pnpm add luxon
 *   pnpm add -D @types/luxon
 */

import { DateTime } from 'luxon';

/**
 * Returns the current date/time in the company's timezone.
 *
 * @param timezone - IANA timezone string (e.g., 'Asia/Kolkata', 'America/New_York')
 * @returns DateTime instance set to the company's timezone
 */
export function nowInCompanyTimezone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

/**
 * Parses a date string and time string into a DateTime in the company's timezone.
 *
 * @param dateStr - Date in 'yyyy-MM-dd' format (e.g., '2026-03-30')
 * @param timeStr - Time in 'HH:mm' format (e.g., '09:00')
 * @param timezone - IANA timezone string
 * @returns DateTime instance in the specified timezone
 */
export function parseInCompanyTimezone(dateStr: string, timeStr: string, timezone: string): DateTime {
  return DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
}

/**
 * Determines the attendance date for a given punch time, accounting for
 * cross-day (night) shifts and the day boundary time.
 *
 * Rules:
 *   - If shift.isCrossDay is true, the attendance date is always the date of the
 *     shift START (the calendar date the employee began working).
 *   - For non-cross-day shifts, the attendance date is determined by the dayBoundaryTime:
 *     if the punch falls before the day boundary, it belongs to the previous calendar date.
 *     For the default boundary of '00:00', punch times always map to their own calendar date.
 *
 * @param punchTime - The DateTime of the punch (already in company timezone)
 * @param shift - The shift configuration: { isCrossDay, startTime (HH:mm) }
 * @param dayBoundaryTime - The time at which the calendar day flips (HH:mm, from AttendanceRule)
 * @param timezone - IANA timezone string
 * @returns ISO date string (YYYY-MM-DD) representing the attendance date
 *
 * @example
 * // Night shift 22:00 - 06:00, punch at 22:15 on 2026-03-30
 * getAttendanceDateForShift(punchAt2215, { isCrossDay: true, startTime: '22:00' }, '00:00', 'Asia/Kolkata')
 * // Returns: '2026-03-30' (shift start date)
 *
 * @example
 * // Day shift 09:00 - 17:00, punch at 09:10 on 2026-03-30
 * getAttendanceDateForShift(punchAt0910, { isCrossDay: false, startTime: '09:00' }, '00:00', 'Asia/Kolkata')
 * // Returns: '2026-03-30'
 */
export function getAttendanceDateForShift(
  punchTime: DateTime,
  shift: { isCrossDay: boolean; startTime: string },
  dayBoundaryTime: string,
  timezone: string,
): string {
  const punchInZone = punchTime.setZone(timezone);

  if (shift.isCrossDay) {
    // Cross-day rule: attendance date = date of shift START.
    // If the punch is in the early morning hours (after midnight), it belongs to
    // the previous calendar date (when the shift actually started).
    const [shiftStartHour] = shift.startTime.split(':').map(Number);
    const punchHour = punchInZone.hour;

    // If the shift starts in the evening (e.g., 22:00) and the punch is in the
    // morning (before the shift start hour), the punch belongs to yesterday's shift.
    if (shiftStartHour !== undefined && punchHour < shiftStartHour) {
      return punchInZone.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    }

    return punchInZone.toFormat('yyyy-MM-dd');
  }

  // Non-cross-day: use dayBoundaryTime to determine the calendar date.
  // If dayBoundaryTime is '00:00' (default), punch times always map to their own date.
  // If dayBoundaryTime is e.g. '06:00', punches between 00:00-05:59 belong to the previous date.
  const [boundaryHour = 0, boundaryMinute = 0] = dayBoundaryTime.split(':').map(Number);
  const boundaryMinutesOfDay = (boundaryHour ?? 0) * 60 + (boundaryMinute ?? 0);
  const punchMinutesOfDay = punchInZone.hour * 60 + punchInZone.minute;

  if (boundaryMinutesOfDay > 0 && punchMinutesOfDay < boundaryMinutesOfDay) {
    // Punch is before the day boundary — belongs to the previous calendar date.
    return punchInZone.minus({ days: 1 }).toFormat('yyyy-MM-dd');
  }

  return punchInZone.toFormat('yyyy-MM-dd');
}

/**
 * Converts a time string ('HH:mm') on a given date to a DateTime in the company timezone.
 * Useful for comparing punch times against shift start/end times.
 *
 * @param dateStr - Date in 'yyyy-MM-dd' format
 * @param timeStr - Time in 'HH:mm' format
 * @param timezone - IANA timezone string
 * @returns DateTime instance
 */
export function toDateTimeInTimezone(dateStr: string, timeStr: string, timezone: string): DateTime {
  return parseInCompanyTimezone(dateStr, timeStr, timezone);
}

/**
 * Gets today's date string (YYYY-MM-DD) in the company's timezone.
 *
 * @param timezone - IANA timezone string
 * @returns Date string in YYYY-MM-DD format
 */
export function todayInCompanyTimezone(timezone: string): string {
  return nowInCompanyTimezone(timezone).toFormat('yyyy-MM-dd');
}
