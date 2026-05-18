export interface SlabConfigListFilters {
  page: number;
  limit: number;
  search?: string | undefined;
  machineId?: string | undefined;
  operationId?: string | undefined;
  partId?: string | undefined;
  locationId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface SlabConfigListResult {
  configs: any[];
  total: number;
  page: number;
  limit: number;
}

export interface DailyEntryListFilters {
  page: number;
  limit: number;
  entryDate?: string | undefined;
  shiftId?: string | undefined;
  operatorId?: string | undefined;
  machineId?: string | undefined;
  partId?: string | undefined;
  status?: string | undefined;
  locationId?: string | undefined;
}

export interface DailyEntryListResult {
  entries: any[];
  total: number;
  page: number;
  limit: number;
}

export interface MonthlyReportListFilters {
  page: number;
  limit: number;
  status?: string | undefined;
  locationId?: string | undefined;
  year?: number | undefined;
}

export interface MonthlyReportListResult {
  reports: any[];
  total: number;
  page: number;
  limit: number;
}
