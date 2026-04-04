/**
 * Probation policy (single source of truth for server + UI copy):
 * 1) Designation master `probationDays` (calendar days from joining) when set and positive
 * 2) Else Grade master `probationMonths` (calendar months added to joining)
 *
 * Notice period on employee: Grade `noticeDays` is the default when the client
 * does not send `noticePeriodDays` (create) or when grade changes (update).
 */

/** Guard against bad master data / typos blowing up Date into 5+ digit years (Prisma rejects those). */
const MAX_PROBATION_DAYS = 3650; // ~10 years
const MAX_PROBATION_MONTHS = 120; // 10 years

/** All HR calendar dates we persist (DOB, joining, probation end, etc.) */
const HR_DATE_MIN_YEAR = 1900;
const HR_DATE_MAX_YEAR = 2200;

/**
 * Parse dates from API/JSON without trusting `new Date(string)` alone — strings like
 * `72003-07-20` parse to a real JS Date in year 72003 and crash Prisma.
 * Prefer leading `YYYY-MM-DD` and reject years outside a sane range before building Date.
 */
export function parseHrDateInput(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getFullYear();
    if (y < HR_DATE_MIN_YEAR || y > HR_DATE_MAX_YEAR) return null;
    return raw;
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m?.[1] && m[2] && m[3]) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    if (y < HR_DATE_MIN_YEAR || y > HR_DATE_MAX_YEAR) return null;
    if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
    const d = new Date(y, mo, day);
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
    return d;
  }
  const fallback = new Date(s);
  if (Number.isNaN(fallback.getTime())) return null;
  const y = fallback.getFullYear();
  if (y < HR_DATE_MIN_YEAR || y > HR_DATE_MAX_YEAR) return null;
  return fallback;
}

function toSafePositiveInt(value: unknown, max: number): number | null {
  if (value == null) return null;
  const n =
    typeof value === 'object' && value !== null && 'toNumber' in (value as object)
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), max);
}

/** Returns null if the date is not a finite calendar date in a sane year range for HR. */
export function normalizeProbationEndForDb(d: Date | null | undefined): Date | null {
  if (d == null) return null;
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < HR_DATE_MIN_YEAR || y > HR_DATE_MAX_YEAR) return null;
  return d;
}

export function computeProbationEndDateFromMasters(params: {
  joiningDate: Date;
  designationProbationDays?: number | null;
  gradeProbationMonths?: number | null;
}): Date | null {
  const joining = params.joiningDate;
  if (Number.isNaN(joining.getTime())) return null;
  const jy = joining.getFullYear();
  if (jy < HR_DATE_MIN_YEAR || jy > HR_DATE_MAX_YEAR) return null;

  const days = toSafePositiveInt(params.designationProbationDays, MAX_PROBATION_DAYS);
  if (days != null && days > 0) {
    const end = new Date(joining);
    end.setDate(end.getDate() + days);
    return normalizeProbationEndForDb(end);
  }

  const months = toSafePositiveInt(params.gradeProbationMonths, MAX_PROBATION_MONTHS);
  if (months != null && months > 0) {
    const end = new Date(joining);
    end.setMonth(end.getMonth() + months);
    return normalizeProbationEndForDb(end);
  }

  return null;
}
