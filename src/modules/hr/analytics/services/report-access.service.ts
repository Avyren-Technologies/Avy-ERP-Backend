import { ApiError } from '../../../../shared/errors';
import type { DataScope, DashboardName, DashboardResponse } from '../analytics.types';

// ─── Dashboard Access Maps ───

type RoleKey = 'employee' | 'manager' | 'finance' | 'hr_personnel' | 'company_admin';

const DASHBOARD_ACCESS: Record<RoleKey, DashboardName[] | '*'> = {
  employee: [],
  manager: ['attendance', 'leave', 'performance'],
  finance: ['payroll', 'compliance', 'executive'],
  hr_personnel: '*',
  company_admin: '*',
};

// ─── Sensitive Field Stripping ───

/** KPI keys that contain salary/compensation data — hidden from managers */
const SALARY_KPI_KEYS = new Set([
  'salary', 'ctc', 'gross_earnings', 'net_pay', 'deductions',
  'pf_amount', 'esi_amount', 'tds_amount',
  'total_salary', 'avg_ctc', 'total_ctc', 'gross_pay', 'total_deductions',
  'pf_contribution', 'esi_contribution', 'professional_tax',
]);

/** KPI keys that contain HR-sensitive data — hidden from finance */
const HR_SENSITIVE_KPI_KEYS = new Set([
  'performance_rating', 'avg_rating', 'rating_distribution',
  'attrition_reason', 'exit_reason', 'resignation_reason',
  'grievance_count', 'grievance_details', 'disciplinary_count',
]);

class ReportAccessService {
  /**
   * Resolve the data scope for a user based on role and requested dashboard.
   * Enforces dashboard-level access and determines which employees are visible.
   */
  async resolveScope(
    userId: string,
    companyId: string,
    role: RoleKey,
    dashboard: DashboardName,
  ): Promise<DataScope> {
    // Employee role: no dashboard access at all
    if (role === 'employee') {
      throw ApiError.forbidden('Employees do not have access to analytics dashboards');
    }

    // Validate dashboard access for the role
    const allowed = DASHBOARD_ACCESS[role];
    if (allowed !== '*' && !allowed.includes(dashboard)) {
      throw ApiError.forbidden(
        `Role "${role}" does not have access to the "${dashboard}" dashboard`,
      );
    }

    // Manager: scoped to direct reports only
    if (role === 'manager') {
      return {
        companyId,
        employeeIds: [userId], // will be expanded to direct reports by the query layer
        isFullOrg: false,
      };
    }

    // Finance, HR Personnel, Company Admin: full org
    return {
      companyId,
      isFullOrg: true,
    };
  }

  /**
   * Strip unauthorized fields from a dashboard response based on the viewer's role.
   * Returns a new object — never mutates the original.
   */
  filterMetrics(response: DashboardResponse, role: RoleKey): DashboardResponse {
    // HR Personnel and Company Admin see everything
    if (role === 'hr_personnel' || role === 'company_admin') {
      return response;
    }

    const sensitiveKeys = role === 'manager' ? SALARY_KPI_KEYS : HR_SENSITIVE_KPI_KEYS;

    const filteredKpis = response.kpis.filter((kpi) => !sensitiveKeys.has(kpi.key));

    const filteredTrends = response.trends.map((trend) => {
      if (!trend) return null;
      return sensitiveKeys.has(trend.key) ? null : trend;
    });

    const filteredDistributions = response.distributions.map((dist) => {
      if (!dist) return null;
      return sensitiveKeys.has(dist.key) ? null : dist;
    });

    const filteredInsights = response.insights.filter(
      (insight) => !sensitiveKeys.has(insight.metric),
    );

    return {
      ...response,
      kpis: filteredKpis,
      trends: filteredTrends,
      distributions: filteredDistributions,
      insights: filteredInsights,
    };
  }

  /**
   * Check whether a role has access to a specific dashboard.
   */
  canAccessDashboard(role: RoleKey, dashboard: DashboardName): boolean {
    if (role === 'employee') return false;
    const allowed = DASHBOARD_ACCESS[role];
    return allowed === '*' || allowed.includes(dashboard);
  }
}

export const reportAccessService = new ReportAccessService();
