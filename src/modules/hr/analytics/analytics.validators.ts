import { z } from 'zod';

export const dashboardFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  gradeId: z.string().optional(),
  employeeTypeId: z.string().optional(),
});

export const drilldownFiltersSchema = dashboardFiltersSchema.extend({
  type: z.string().min(1, 'Drilldown type is required'),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  search: z.string().max(200).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const exportFiltersSchema = z.object({
  format: z.enum(['excel', 'pdf', 'csv']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  gradeId: z.string().optional(),
  employeeTypeId: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const alertActionSchema = z.object({
  alertId: z.string().min(1, 'Alert ID is required'),
});

export const recomputeSchema = z.object({
  date: z.string().optional(),
});
