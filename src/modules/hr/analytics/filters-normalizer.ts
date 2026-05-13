import type { DashboardFilters, RawDashboardFilters } from './analytics.types';

function startOfMonth(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}-01`;
}

function today(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function normalizeFilters(
  raw: RawDashboardFilters,
  companyTimezone: string = 'Asia/Kolkata',
): DashboardFilters {
  // When month/year are provided, derive dateFrom/dateTo from them
  // (month/year take precedence over explicit dateFrom/dateTo)
  let dateFrom: string;
  let dateTo: string;

  if (raw.month != null && raw.year != null) {
    const m = String(raw.month).padStart(2, '0');
    dateFrom = `${raw.year}-${m}-01`;
    // Last day of the month
    const lastDay = new Date(raw.year, raw.month, 0).getDate();
    dateTo = `${raw.year}-${m}-${String(lastDay).padStart(2, '0')}`;
  } else {
    dateFrom = raw.dateFrom ?? startOfMonth(companyTimezone);
    dateTo = raw.dateTo ?? today(companyTimezone);
  }

  const result: DashboardFilters = {
    dateFrom: dateFrom > dateTo ? dateTo : dateFrom,
    dateTo,
    page: Math.max(raw.page ?? 1, 1),
    limit: Math.min(Math.max(raw.limit ?? 20, 1), 100),
    sortBy: raw.sortBy ?? 'createdAt',
    sortOrder: raw.sortOrder === 'asc' ? 'asc' : 'desc',
  };

  if (raw.departmentId) result.departmentId = raw.departmentId;
  if (raw.locationId) result.locationId = raw.locationId;
  if (raw.gradeId) result.gradeId = raw.gradeId;
  if (raw.employeeTypeId) result.employeeTypeId = raw.employeeTypeId;
  if (raw.shiftId) result.shiftId = raw.shiftId;
  if (raw.designationId) result.designationId = raw.designationId;
  if (raw.includeInactive) result.includeInactive = raw.includeInactive;
  if (raw.month != null) result.month = raw.month;
  if (raw.year != null) result.year = raw.year;

  const trimmedSearch = raw.search?.trim().slice(0, 200);
  if (trimmedSearch) result.search = trimmedSearch;

  return result;
}
