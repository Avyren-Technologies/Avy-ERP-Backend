import { platformPrisma, tenantConnectionManager } from '../../../../config/database';
import { logger } from '../../../../config/logger';
import type {
  DashboardFilters,
  DashboardName,
  DashboardResponse,
  DataScope,
  KPICard,
  RawDashboardFilters,
  TrendSeries,
  Distribution,
  DashboardMeta,
} from '../analytics.types';
import { analyticsService } from './analytics.service';
import { reportAccessService } from './report-access.service';
import { analyticsAuditService } from './analytics-audit.service';
import { insightsEngineService } from '../insights/insights-engine.service';
import { alertService } from '../alerts/alert.service';
import { normalizeFilters } from '../filters-normalizer';

// ─── Helper Types ───

type SettledResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

// ─── Tenure Estimation ───

/**
 * Estimate avg tenure (in months) from tenure band distribution.
 * Uses midpoint of each band for weighted average.
 */
function estimateAvgTenure(byTenureBand: { label: string; count: number }[]): number {
  const midpoints: Record<string, number> = {
    '<6 months': 3,
    '6-12 months': 9,
    '1-2 years': 18,
    '2-3 years': 30,
    '3-5 years': 48,
    '5-10 years': 90,
    '10+ years': 144,
  };

  let totalWeighted = 0;
  let totalCount = 0;
  for (const { label, count } of byTenureBand) {
    const mid = midpoints[label] ?? 36; // fallback ~3 years
    totalWeighted += mid * count;
    totalCount += count;
  }

  return totalCount > 0 ? Math.round((totalWeighted / totalCount) * 10) / 10 : 0;
}

// ─── Dashboard Orchestrator ───

class DashboardOrchestratorService {
  // ─── Main Entry Point ───

  async getDashboard(
    dashboard: DashboardName,
    rawFilters: RawDashboardFilters,
    userId: string,
    companyId: string,
    role: string,
    companyTimezone?: string,
  ): Promise<{ success: true; data: DashboardResponse }> {
    const startTime = Date.now();

    // 1. Normalize filters
    const filters = normalizeFilters(rawFilters, companyTimezone);

    // 2. Resolve data scope (throws on access denied)
    const scope = await reportAccessService.resolveScope(
      userId,
      companyId,
      role as any,
      dashboard,
    );

    // 3. Build dashboard
    let response: DashboardResponse;
    try {
      response = await this.buildDashboard(dashboard, filters, scope);
    } catch (error) {
      logger.error('analytics_dashboard_build_error', { dashboard, error, companyId });
      response = this.buildEmptyDashboard(dashboard, filters);
    }

    // 4. Filter metrics by role
    response = reportAccessService.filterMetrics(response, role as any);

    // 5. Audit log (fire-and-forget)
    analyticsAuditService.logView(userId, companyId, dashboard).catch(() => {});

    // 6. Observability
    const loadTimeMs = Date.now() - startTime;
    logger.info('analytics_dashboard_loaded', {
      dashboard,
      loadTimeMs,
      companyId,
      userId,
      partialFailures: response.meta.partialFailures ?? [],
    });

    return { success: true, data: response };
  }

  // ─── Router ───

  private async buildDashboard(
    dashboard: DashboardName,
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    switch (dashboard) {
      case 'executive':
        return this.buildExecutiveDashboard(filters, scope);
      case 'workforce':
        return this.buildWorkforceDashboard(filters, scope);
      case 'attendance':
        return this.buildAttendanceDashboard(filters, scope);
      case 'leave':
        return this.buildLeaveDashboard(filters, scope);
      case 'payroll':
        return this.buildPayrollDashboard(filters, scope);
      case 'compliance':
        return this.buildComplianceDashboard(filters, scope);
      case 'performance':
        return this.buildPerformanceDashboard(filters, scope);
      case 'recruitment':
        return this.buildRecruitmentDashboard(filters, scope);
      case 'attrition':
        return this.buildAttritionDashboard(filters, scope);
      default:
        return this.buildEmptyDashboard(dashboard, filters);
    }
  }

  // ─── Executive Dashboard ───

  private async buildExecutiveDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [headcountResult, attritionResult, payrollResult, attendanceResult, recruitmentResult, statutoryResult] =
      await Promise.allSettled([
        analyticsService.getHeadcountSummary(filters, scope),
        analyticsService.getAttritionSummary(filters, scope),
        analyticsService.getPayrollCostSummary(filters, scope),
        analyticsService.getAttendanceSummary(filters, scope),
        this.withTenantDb(scope.companyId, (db) => analyticsService.getRecruitmentFunnel(filters, scope, db)),
        analyticsService.getStatutorySummary(filters, scope),
      ]);

    const headcount = this.unwrapSettled(headcountResult, 'headcountSummary', partialFailures);
    const attrition = this.unwrapSettled(attritionResult, 'attritionSummary', partialFailures);
    const payroll = this.unwrapSettled(payrollResult, 'payrollCostSummary', partialFailures);
    const attendance = this.unwrapSettled(attendanceResult, 'attendanceSummary', partialFailures);
    const recruitment = this.unwrapSettled(recruitmentResult, 'recruitmentFunnel', partialFailures);
    const statutory = this.unwrapSettled(statutoryResult, 'statutorySummary', partialFailures);

    // Trends (12 months)
    const trendFilters = this.extendFiltersForMonths(filters, 12);
    const [headcountTrendResult, payrollTrendResult] = await Promise.allSettled([
      analyticsService.getHeadcountTrend(trendFilters, scope),
      analyticsService.getPayrollTrend(trendFilters, scope),
    ]);

    const headcountTrend = this.unwrapSettled(headcountTrendResult, 'headcountTrend', partialFailures);
    const payrollTrend = this.unwrapSettled(payrollTrendResult, 'payrollTrend', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('total_headcount', 'Headcount', headcount?.totalHeadcount ?? 0, 'number', 'workforce:employeeDirectory', headcount?.previousMonthHeadcount),
      this.buildKPI('attrition_rate', 'Attrition Rate', attrition?.attritionRate ?? 0, 'percentage', 'attrition:exitDetail'),
      this.buildKPI('total_salary', 'Payroll Cost', payroll?.totalGross ?? 0, 'currency', 'payroll:salaryRegister', payroll?.previousMonthGross),
      this.buildKPI('attendance_percent', 'Attendance %', attendance?.attendancePercent ?? 0, 'percentage', 'attendance:register'),
      this.buildKPI('open_positions', 'Open Positions', recruitment?.openPositions ?? 0, 'number', 'recruitment:requisitionTracker'),
      this.buildKPI('compliance_score', 'Compliance Score', statutory?.complianceScore ?? 0, 'percentage', 'compliance:filingTracker'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'executive', partialFailures);

    const dataForInsights: Record<string, unknown> = {
      headcount: headcount?.totalHeadcount ?? 0,
      attritionRate: attrition?.attritionRate ?? 0,
      payrollCost: payroll?.totalGross ?? 0,
      attendancePercent: attendance?.attendancePercent ?? 0,
    };

    const insights = insightsEngineService.generateInsights('executive', dataForInsights);

    return this.assembleResponse(kpis, [headcountTrend, payrollTrend], [], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Workforce Dashboard ───

  private async buildWorkforceDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [headcountResult, demographicsResult, deptStrengthResult] = await Promise.allSettled([
      analyticsService.getHeadcountSummary(filters, scope),
      analyticsService.getDemographics(filters, scope),
      analyticsService.getDepartmentStrength(filters, scope),
    ]);

    const headcount = this.unwrapSettled(headcountResult, 'headcountSummary', partialFailures);
    const demographics = this.unwrapSettled(demographicsResult, 'demographics', partialFailures);
    const deptStrength = this.unwrapSettled(deptStrengthResult, 'departmentStrength', partialFailures);

    const totalHeadcount = headcount?.totalHeadcount ?? 0;

    // Compute avg tenure from tenure distribution
    const tenureData = demographics?.tenure?.data ?? [];
    const tenureBand = tenureData.map((d) => ({ label: d.label, count: d.value }));
    const avgTenure = estimateAvgTenure(tenureBand);

    const kpis: KPICard[] = [
      this.buildKPI('total_employees', 'Total Employees', totalHeadcount, 'number', 'workforce:employeeDirectory'),
      this.buildKPI('joiners', 'Joiners (This Period)', headcount?.joinersCount ?? 0, 'number', 'workforce:employeeDirectory'),
      this.buildKPI('avg_tenure', 'Avg Tenure (Months)', avgTenure, 'number', 'workforce:employeeDirectory'),
      this.buildKPI('vacancy_rate', 'On Notice', headcount?.noticeCount ?? 0, 'number', 'attrition:exitDetail'),
    ];

    const distributions: (Distribution | null)[] = [
      demographics?.gender ?? null,
      demographics?.ageGroup ?? null,
      demographics?.tenure ?? null,
      deptStrength ?? null,
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'workforce', partialFailures);
    const insights = insightsEngineService.generateInsights('workforce', {
      totalHeadcount,
      joiners: headcount?.joinersCount ?? 0,
      leavers: headcount?.leaversCount ?? 0,
    });

    return this.assembleResponse(kpis, [], distributions, insights, alerts, partialFailures, filters, scope);
  }

  // ─── Attendance Dashboard ───

  private async buildAttendanceDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const trendFilters = this.extendFiltersForDays(filters, 30);
    const [summaryResult, trendResult, productivityResult, otRecordsResult] = await Promise.allSettled([
      analyticsService.getAttendanceSummary(filters, scope),
      analyticsService.getAttendanceTrend(trendFilters, scope),
      analyticsService.getProductivityIndex(trendFilters, scope),
      analyticsService.getAttendanceRecords(trendFilters, scope),
    ]);

    const summary = this.unwrapSettled(summaryResult, 'attendanceSummary', partialFailures);
    const trend = this.unwrapSettled(trendResult, 'attendanceTrend', partialFailures);
    const productivity = this.unwrapSettled(productivityResult, 'productivityIndex', partialFailures);
    const otRecords = this.unwrapSettled(otRecordsResult, 'overtimeRecords', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('attendance_percent', 'Today Attendance %', summary?.attendancePercent ?? 0, 'percentage', 'attendance:register'),
      this.buildKPI('late_count', 'Late Arrivals', summary?.lateCount ?? 0, 'number', 'attendance:lateEmployees'),
      this.buildKPI('avg_work_hours', 'Avg Work Hours', summary?.avgWorkHours ?? 0, 'number', 'attendance:register'),
      this.buildKPI('productivity_index', 'Productivity Index', summary?.productivityIndex ?? 0, 'number', 'attendance:register'),
    ];

    // OT trend from actual overtime hours (not attendance rate)
    const otTrend: TrendSeries | null = otRecords
      ? {
          key: 'overtime_trend',
          label: 'Overtime Hours',
          chartType: 'bar',
          data: otRecords.map((r: any) => ({
            date: r.date.toISOString().split('T')[0],
            value: r.totalOvertimeHours ?? 0,
          })),
        }
      : null;

    const alerts = await this.getAlertsSafe(scope.companyId, 'attendance', partialFailures);

    // TODO: Fetch last 6 months of attendance data from AttendanceAnalyticsDaily for anomaly detection.
    // Pass historicalData (keyed arrays of attendance_rate, productivity_index) as the third argument
    // to generateInsights() so the anomaly detector can flag statistical outliers.
    // Example:
    //   const historicalRecords = await platformPrisma.attendanceAnalyticsDaily.findMany({
    //     where: { companyId: scope.companyId }, orderBy: { date: 'desc' }, take: 180,
    //     select: { presentCount: true, totalEmployees: true, productivityIndex: true },
    //   });
    //   const historicalData = {
    //     attendance_rate: historicalRecords.map(r => r.totalEmployees > 0 ? r.presentCount / r.totalEmployees : 0),
    //     productivity_index: historicalRecords.map(r => r.productivityIndex),
    //   };
    //   insightsEngineService.generateInsights('attendance', currentData, historicalData);

    const insights = insightsEngineService.generateInsights('attendance', {
      attendancePercent: summary?.attendancePercent ?? 0,
      lateCount: summary?.lateCount ?? 0,
      avgWorkHours: summary?.avgWorkHours ?? 0,
      productivityIndex: summary?.productivityIndex ?? 0,
    });

    return this.assembleResponse(kpis, [trend, otTrend, productivity], [], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Leave Dashboard ───

  private async buildLeaveDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [leaveResult] = await Promise.allSettled([
      this.withTenantDb(scope.companyId, (db) => analyticsService.getLeaveUtilization(filters, scope, db)),
    ]);

    const leave = this.unwrapSettled(leaveResult, 'leaveUtilization', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('avg_balance', 'Avg Leave Balance', leave?.avgBalance ?? 0, 'number', 'leave:leaveBalance'),
      this.buildKPI('utilization_percent', 'Utilization %', leave?.utilizationPercent ?? 0, 'percentage', 'leave:leaveBalance'),
      this.buildKPI('pending_approvals', 'Pending Approvals', leave?.pendingApprovals ?? 0, 'number', 'leave:pendingApprovals'),
      this.buildKPI('encashment_liability', 'Encashment Liability', leave?.encashmentLiability ?? 0, 'currency', 'leave:leaveBalance'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'leave', partialFailures);
    const insights = insightsEngineService.generateInsights('leave', {
      avgBalance: leave?.avgBalance ?? 0,
      utilizationPercent: leave?.utilizationPercent ?? 0,
      pendingApprovals: leave?.pendingApprovals ?? 0,
    });

    return this.assembleResponse(kpis, [], [], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Payroll Dashboard ───

  private async buildPayrollDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const trendFilters = this.extendFiltersForMonths(filters, 12);
    const [costResult, trendResult, ctcResult] = await Promise.allSettled([
      analyticsService.getPayrollCostSummary(filters, scope),
      analyticsService.getPayrollTrend(trendFilters, scope),
      analyticsService.getCTCDistribution(filters, scope),
    ]);

    const cost = this.unwrapSettled(costResult, 'payrollCostSummary', partialFailures);
    const trend = this.unwrapSettled(trendResult, 'payrollTrend', partialFailures);
    const ctc = this.unwrapSettled(ctcResult, 'ctcDistribution', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('total_salary', 'Total Payroll Cost', cost?.totalGross ?? 0, 'currency', 'payroll:salaryRegister', cost?.previousMonthGross),
      this.buildKPI('avg_ctc', 'Avg CTC', cost?.avgCTC ?? 0, 'currency', 'payroll:salaryRegister'),
      this.buildKPI('mom_variance', 'MoM Variance', cost?.momVariance ?? 0, 'percentage', 'payroll:salaryRegister'),
      this.buildKPI('exceptions', 'Payroll Exceptions', cost?.exceptions ?? 0, 'number', 'payroll:salaryRegister'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'payroll', partialFailures);
    const insights = insightsEngineService.generateInsights('payroll', {
      totalGross: cost?.totalGross ?? 0,
      avgCTC: cost?.avgCTC ?? 0,
      momVariance: cost?.momVariance ?? 0,
      exceptions: cost?.exceptions ?? 0,
    });

    return this.assembleResponse(kpis, [trend], [ctc], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Compliance Dashboard ───

  private async buildComplianceDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [statutoryResult] = await Promise.allSettled([
      analyticsService.getStatutorySummary(filters, scope),
    ]);

    const statutory = this.unwrapSettled(statutoryResult, 'statutorySummary', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('compliance_score', 'Compliance Score', statutory?.complianceScore ?? 0, 'percentage', 'compliance:filingTracker'),
      this.buildKPI('overdue_filings', 'Overdue Filings', 'N/A', 'text', 'compliance:filingTracker'),
      this.buildKPI('pending_grievances', 'Pending Grievances', 'N/A', 'text', 'compliance:grievanceCases'),
      this.buildKPI('active_disciplinary', 'Active Disciplinary', 'N/A', 'text', 'compliance:grievanceCases'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'compliance', partialFailures);
    const insights = insightsEngineService.generateInsights('compliance', {
      complianceScore: statutory?.complianceScore ?? 0,
    });

    return this.assembleResponse(kpis, [], [], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Performance Dashboard ───

  private async buildPerformanceDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [appraisalResult] = await Promise.allSettled([
      this.withTenantDb(scope.companyId, (db) => analyticsService.getAppraisalStatus(filters, scope, db)),
    ]);

    const appraisal = this.unwrapSettled(appraisalResult, 'appraisalStatus', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('completion_percent', 'Appraisal Completion', appraisal?.completionPercent ?? 0, 'percentage', 'performance:appraisalDetail'),
      this.buildKPI('avg_rating', 'Avg Rating', appraisal?.avgRating ?? 0, 'number', 'performance:appraisalDetail'),
      this.buildKPI('skill_coverage', 'Skill Coverage', 'N/A', 'text', 'performance:skillGap'),
      this.buildKPI('succession_coverage', 'Succession Coverage', 'N/A', 'text', 'performance:appraisalDetail'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'performance', partialFailures);
    const insights = insightsEngineService.generateInsights('performance', {
      completionPercent: appraisal?.completionPercent ?? 0,
      avgRating: appraisal?.avgRating ?? 0,
    });

    return this.assembleResponse(kpis, [], [], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Recruitment Dashboard ───

  private async buildRecruitmentDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const [recruitmentResult] = await Promise.allSettled([
      this.withTenantDb(scope.companyId, (db) => analyticsService.getRecruitmentFunnel(filters, scope, db)),
    ]);

    const recruitment = this.unwrapSettled(recruitmentResult, 'recruitmentFunnel', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('open_positions', 'Open Positions', recruitment?.openPositions ?? 0, 'number', 'recruitment:requisitionTracker'),
      this.buildKPI('pipeline_count', 'Pipeline Count', recruitment?.pipelineCount ?? 0, 'number', 'recruitment:candidatePipeline'),
      this.buildKPI('time_to_hire', 'Avg Time-to-Hire (days)', recruitment?.avgTimeToHire ?? 0, 'number', 'recruitment:requisitionTracker'),
      this.buildKPI('acceptance_rate', 'Acceptance Rate', recruitment?.acceptanceRate ?? 0, 'percentage', 'recruitment:candidatePipeline'),
    ];

    const alerts = await this.getAlertsSafe(scope.companyId, 'recruitment', partialFailures);
    const insights = insightsEngineService.generateInsights('recruitment', {
      openPositions: recruitment?.openPositions ?? 0,
      pipelineCount: recruitment?.pipelineCount ?? 0,
      avgTimeToHire: recruitment?.avgTimeToHire ?? 0,
      acceptanceRate: recruitment?.acceptanceRate ?? 0,
    });

    return this.assembleResponse(kpis, [], [recruitment?.funnel ?? null], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Attrition Dashboard ───

  private async buildAttritionDashboard(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<DashboardResponse> {
    const partialFailures: string[] = [];

    const trendFilters = this.extendFiltersForMonths(filters, 12);
    const [summaryResult, trendResult, flightRiskResult] = await Promise.allSettled([
      analyticsService.getAttritionSummary(filters, scope),
      analyticsService.getAttritionTrend(trendFilters, scope),
      analyticsService.getFlightRiskEmployees(filters, scope),
    ]);

    const summary = this.unwrapSettled(summaryResult, 'attritionSummary', partialFailures);
    const trend = this.unwrapSettled(trendResult, 'attritionTrend', partialFailures);
    const flightRisk = this.unwrapSettled(flightRiskResult, 'flightRiskEmployees', partialFailures);

    const kpis: KPICard[] = [
      this.buildKPI('attrition_rate', 'Attrition Rate', summary?.attritionRate ?? 0, 'percentage', 'attrition:exitDetail'),
      this.buildKPI('vol_vs_invol', `Vol: ${summary?.voluntaryExits ?? 0} / Invol: ${summary?.involuntaryExits ?? 0}`, summary?.totalExits ?? 0, 'text', 'attrition:exitDetail'),
      this.buildKPI('avg_tenure_exit', 'Avg Tenure at Exit (mo)', summary?.avgTenureAtExit ?? 0, 'number', 'attrition:exitDetail'),
      this.buildKPI('pending_fnf', 'Pending F&F', summary?.pendingFnF ?? 0, 'number', 'attrition:fnfTracker'),
    ];

    // Exit type distribution
    const exitTypeDistribution: Distribution | null =
      summary
        ? {
            key: 'exit_type_distribution',
            label: 'Exit Type Breakdown',
            chartType: 'donut',
            data: [
              { label: 'Voluntary', value: summary.voluntaryExits },
              { label: 'Involuntary', value: summary.involuntaryExits },
            ],
          }
        : null;

    const alerts = await this.getAlertsSafe(scope.companyId, 'attrition', partialFailures);
    const insights = insightsEngineService.generateInsights('attrition', {
      attritionRate: summary?.attritionRate ?? 0,
      voluntaryExits: summary?.voluntaryExits ?? 0,
      involuntaryExits: summary?.involuntaryExits ?? 0,
      flightRiskCount: flightRisk?.length ?? 0,
    });

    return this.assembleResponse(kpis, [trend], [exitTypeDistribution], insights, alerts, partialFailures, filters, scope);
  }

  // ─── Internal Helpers ───

  private buildEmptyDashboard(dashboard: string, filters: DashboardFilters): DashboardResponse {
    return {
      kpis: [],
      trends: [],
      distributions: [],
      insights: [],
      alerts: [],
      drilldownTypes: [],
      meta: {
        lastComputedAt: null,
        version: 0,
        filtersApplied: filters,
        scope: 'full_org',
        dataCompleteness: {
          attendanceComplete: false,
          payrollComplete: false,
          appraisalComplete: false,
          exitInterviewsComplete: false,
        },
      },
    };
  }

  private buildKPI(
    key: string,
    label: string,
    value: number | string,
    format: KPICard['format'],
    drilldownType: string,
    previousValue?: number,
  ): KPICard {
    const kpi: KPICard = { key, label, value, format, drilldownType };

    if (typeof previousValue === 'number' && previousValue > 0 && typeof value === 'number') {
      const changePercent = Math.round(((value - previousValue) / previousValue) * 100);
      kpi.trend = {
        direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'neutral',
        changePercent: Math.abs(changePercent),
        comparedTo: 'previous month',
      };
    }

    return kpi;
  }

  private unwrapSettled<T>(
    result: SettledResult<T>,
    label: string,
    partialFailures: string[],
  ): T | null {
    if (result.status === 'fulfilled') return result.value;
    logger.error(`analytics_partial_failure: ${label}`, { error: result.reason });
    partialFailures.push(label);
    return null;
  }

  private assembleResponse(
    kpis: KPICard[],
    trends: (TrendSeries | null)[],
    distributions: (Distribution | null)[],
    insights: any[],
    alerts: any[],
    partialFailures: string[],
    filters: DashboardFilters,
    scope: DataScope,
  ): DashboardResponse {
    return {
      kpis,
      trends,
      distributions,
      insights,
      alerts,
      drilldownTypes: kpis.map((k) => k.drilldownType),
      meta: {
        lastComputedAt: new Date().toISOString(),
        version: 1,
        filtersApplied: filters,
        scope: scope.isFullOrg ? 'full_org' : 'team',
        dataCompleteness: {
          attendanceComplete: !partialFailures.some((f) => f.includes('attendance')),
          payrollComplete: !partialFailures.some((f) => f.includes('payroll')),
          appraisalComplete: !partialFailures.some((f) => f.includes('appraisal')),
          exitInterviewsComplete: !partialFailures.some((f) => f.includes('attrition')),
        },
        ...(partialFailures.length > 0 ? { partialFailures } : {}),
      },
    };
  }

  private async getAlertsSafe(
    companyId: string,
    dashboard: DashboardName,
    partialFailures: string[],
  ): Promise<any[]> {
    try {
      return await alertService.getActiveAlerts(companyId, dashboard);
    } catch (error) {
      logger.error('analytics_alerts_fetch_error', { error, companyId, dashboard });
      partialFailures.push('alerts');
      return [];
    }
  }

  private async withTenantDb<T>(
    companyId: string,
    fn: (db: any) => Promise<T>,
  ): Promise<T | null> {
    let tenantDb: any = null;
    try {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { companyId },
        select: { schemaName: true },
      });
      if (!tenant) return null;

      tenantDb = tenantConnectionManager.getClient({ schemaName: tenant.schemaName });
      return await fn(tenantDb);
    } catch (error) {
      logger.error('analytics_tenant_db_error', { error, companyId });
      return null;
    } finally {
      if (tenantDb) {
        tenantDb.$disconnect().catch(() => {});
      }
    }
  }

  private extendFiltersForMonths(filters: DashboardFilters, months: number): DashboardFilters {
    const dateFrom = new Date(filters.dateTo);
    dateFrom.setMonth(dateFrom.getMonth() - months);
    return { ...filters, dateFrom: dateFrom.toISOString().split('T')[0] ?? '' };
  }

  private extendFiltersForDays(filters: DashboardFilters, days: number): DashboardFilters {
    const dateFrom = new Date(filters.dateTo);
    dateFrom.setDate(dateFrom.getDate() - days);
    return { ...filters, dateFrom: dateFrom.toISOString().split('T')[0] ?? '' };
  }
}

export const dashboardOrchestratorService = new DashboardOrchestratorService();
