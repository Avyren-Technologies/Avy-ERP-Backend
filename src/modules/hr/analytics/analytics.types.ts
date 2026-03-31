// ─── Filter Types ───
export interface RawDashboardFilters {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  departmentId?: string | undefined;
  locationId?: string | undefined;
  gradeId?: string | undefined;
  employeeTypeId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: string | undefined;
  search?: string | undefined;
}

export interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  departmentId?: string;
  locationId?: string;
  gradeId?: string;
  employeeTypeId?: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
}

// ─── Scope Types ───
export interface DataScope {
  companyId: string;
  departmentIds?: string[];
  locationIds?: string[];
  employeeIds?: string[];
  isFullOrg: boolean;
}

// ─── Dashboard Response Types ───
export interface KPICard {
  key: string;
  label: string;
  value: number | string;
  format: 'number' | 'currency' | 'percentage' | 'text';
  drilldownType: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    changePercent: number;
    comparedTo: string;
  };
}

export interface TrendSeries {
  key: string;
  label: string;
  data: { date: string; value: number }[];
  chartType: 'line' | 'area' | 'bar';
}

export interface Distribution {
  key: string;
  label: string;
  data: { label: string; value: number; color?: string }[];
  chartType: 'donut' | 'bar' | 'heatmap' | 'scatter' | 'funnel';
}

export type InsightCategory = 'info' | 'warning' | 'critical' | 'positive';

export interface Insight {
  id: string;
  dashboard: string;
  category: InsightCategory;
  title: string;
  description: string;
  metric: string;
  currentValue: number;
  benchmarkValue?: number;
  changePercent?: number;
  affectedEntity?: string;
  actionable: boolean;
  drilldownType?: string;
}

export interface DataCompleteness {
  attendanceComplete: boolean;
  payrollComplete: boolean;
  appraisalComplete: boolean;
  exitInterviewsComplete: boolean;
}

export interface DashboardMeta {
  lastComputedAt: string | null;
  version: number;
  filtersApplied: DashboardFilters;
  scope: 'full_org' | 'team' | 'personal';
  dataCompleteness: DataCompleteness;
  partialFailures?: string[];
}

export interface AlertData {
  id: string;
  dashboard: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardResponse {
  kpis: KPICard[];
  trends: (TrendSeries | null)[];
  distributions: (Distribution | null)[];
  insights: Insight[];
  alerts: AlertData[];
  drilldownTypes: string[];
  meta: DashboardMeta;
}

export type DashboardName = 'executive' | 'workforce' | 'attendance' | 'leave' | 'payroll' | 'compliance' | 'performance' | 'recruitment' | 'attrition';

// ─── Intelligence Types ───
export interface InsightRule {
  id: string;
  evaluate: (data: Record<string, unknown>) => boolean;
  generate: (data: Record<string, unknown>) => Omit<Insight, 'id' | 'dashboard' | 'metric' | 'currentValue'>;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  severity?: 'MEDIUM' | 'HIGH';
  direction?: 'ABOVE' | 'BELOW';
  zScore?: number;
}

// ─── Report Types ───
export interface PaginatedReport<T = Record<string, unknown>> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
