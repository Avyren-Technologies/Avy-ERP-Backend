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
  const dateFrom = raw.dateFrom ?? startOfMonth(companyTimezone);
  const dateTo = raw.dateTo ?? today(companyTimezone);

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

  const trimmedSearch = raw.search?.trim().slice(0, 200);
  if (trimmedSearch) result.search = trimmedSearch;

  return result;
}
