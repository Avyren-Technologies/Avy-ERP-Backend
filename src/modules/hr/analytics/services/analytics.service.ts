import { platformPrisma } from '../../../../config/database';
import { logger } from '../../../../config/logger';
import type { DashboardFilters, DataScope, TrendSeries, Distribution } from '../analytics.types';

// ─── Helper Types ───

interface ScopeWhere {
  companyId: string;
  departmentId?: string;
  locationId?: string;
}

// ─── Analytics Service ───

class AnalyticsService {
  // ─── Generic Helpers ───

  private async getLatest<T>(model: any, where: Record<string, unknown>): Promise<T | null> {
    return model.findFirst({ where, orderBy: { version: 'desc' } });
  }

  private buildScopeWhere(filters: DashboardFilters, scope: DataScope): ScopeWhere {
    const where: ScopeWhere = { companyId: scope.companyId };
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.locationId) where.locationId = filters.locationId;
    return where;
  }

  private safeNumber(val: unknown, fallback = 0): number {
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string') {
      const parsed = Number(val);
      return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  }

  private safeJson<T>(val: unknown, fallback: T): T {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return val as T;
    return fallback;
  }

  // ─── Employee / Headcount ───

  async getHeadcountSummary(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    totalHeadcount: number;
    activeCount: number;
    probationCount: number;
    noticeCount: number;
    joinersCount: number;
    leaversCount: number;
    previousMonthHeadcount: number;
  }> {
    const where = this.buildScopeWhere(filters, scope);

    const latest = await this.getLatest<any>(platformPrisma.employeeAnalyticsDaily, {
      ...where,
      date: new Date(filters.dateTo),
    });

    // Previous month comparison
    const prevDate = new Date(filters.dateTo);
    prevDate.setMonth(prevDate.getMonth() - 1);

    const previous = await this.getLatest<any>(platformPrisma.employeeAnalyticsDaily, {
      ...where,
      date: prevDate,
    });

    return {
      totalHeadcount: this.safeNumber(latest?.totalHeadcount),
      activeCount: this.safeNumber(latest?.activeCount),
      probationCount: this.safeNumber(latest?.probationCount),
      noticeCount: this.safeNumber(latest?.noticeCount),
      joinersCount: this.safeNumber(latest?.joinersCount),
      leaversCount: this.safeNumber(latest?.leaversCount),
      previousMonthHeadcount: this.safeNumber(previous?.totalHeadcount),
    };
  }

  async getHeadcountTrend(filters: DashboardFilters, scope: DataScope): Promise<TrendSeries> {
    const where = this.buildScopeWhere(filters, scope);

    const records = await platformPrisma.employeeAnalyticsDaily.findMany({
      where: {
        ...where,
        date: { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) },
      },
      orderBy: { date: 'asc' },
      distinct: ['date'],
    });

    return {
      key: 'headcount_trend',
      label: 'Headcount Trend',
      chartType: 'line',
      data: records.map((r: any) => ({
        date: r.date.toISOString().split('T')[0],
        value: this.safeNumber(r.totalHeadcount),
      })),
    };
  }

  async getDemographics(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    gender: Distribution;
    ageGroup: Distribution;
    tenure: Distribution;
  }> {
    const where = this.buildScopeWhere(filters, scope);

    const latest = await this.getLatest<any>(platformPrisma.employeeAnalyticsDaily, {
      ...where,
      date: new Date(filters.dateTo),
    });

    const genderBreakdown = this.safeJson<{ label: string; count: number }[]>(
      latest?.byGender,
      [],
    );
    const ageBreakdown = this.safeJson<{ label: string; count: number }[]>(
      latest?.byAgeGroup,
      [],
    );
    const tenureBreakdown = this.safeJson<{ label: string; count: number }[]>(
      latest?.byTenure,
      [],
    );

    return {
      gender: {
        key: 'gender_distribution',
        label: 'Gender Distribution',
        chartType: 'donut',
        data: genderBreakdown.map((g) => ({ label: g.label, value: g.count })),
      },
      ageGroup: {
        key: 'age_distribution',
        label: 'Age Distribution',
        chartType: 'bar',
        data: ageBreakdown.map((a) => ({ label: a.label, value: a.count })),
      },
      tenure: {
        key: 'tenure_distribution',
        label: 'Tenure Distribution',
        chartType: 'bar',
        data: tenureBreakdown.map((t) => ({ label: t.label, value: t.count })),
      },
    };
  }

  async getDepartmentStrength(filters: DashboardFilters, scope: DataScope): Promise<Distribution> {
    const where = this.buildScopeWhere(filters, scope);

    const latest = await this.getLatest<any>(platformPrisma.employeeAnalyticsDaily, {
      ...where,
      date: new Date(filters.dateTo),
    });

    const breakdown = this.safeJson<{ label: string; count: number }[]>(
      latest?.byDepartment,
      [],
    );

    return {
      key: 'department_strength',
      label: 'Department Strength',
      chartType: 'bar',
      data: breakdown.map((d) => ({ label: d.label, value: d.count })),
    };
  }

  // ─── Attendance ───

  async getAttendanceSummary(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    attendancePercent: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    avgWorkHours: number;
    totalOvertimeHours: number;
    productivityIndex: number;
    totalEmployees: number;
  }> {
    const where = this.buildScopeWhere(filters, scope);

    const latest = await this.getLatest<any>(platformPrisma.attendanceAnalyticsDaily, {
      ...where,
      date: new Date(filters.dateTo),
    });

    const totalEmployees = this.safeNumber(latest?.totalEmployees, 1);
    const presentCount = this.safeNumber(latest?.presentCount);

    return {
      attendancePercent: totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0,
      presentCount,
      absentCount: this.safeNumber(latest?.absentCount),
      lateCount: this.safeNumber(latest?.lateCount),
      avgWorkHours: this.safeNumber(latest?.avgWorkHours),
      totalOvertimeHours: this.safeNumber(latest?.totalOvertimeHours),
      productivityIndex: this.safeNumber(latest?.productivityIndex),
      totalEmployees,
    };
  }

  async getAttendanceTrend(filters: DashboardFilters, scope: DataScope): Promise<TrendSeries> {
    const where = this.buildScopeWhere(filters, scope);

    const records = await platformPrisma.attendanceAnalyticsDaily.findMany({
      where: {
        ...where,
        date: { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) },
      },
      orderBy: { date: 'asc' },
      distinct: ['date'],
    });

    return {
      key: 'attendance_trend',
      label: 'Attendance Trend',
      chartType: 'area',
      data: records.map((r: any) => {
        const total = this.safeNumber(r.totalEmployees, 1);
        const present = this.safeNumber(r.presentCount);
        return {
          date: r.date.toISOString().split('T')[0],
          value: total > 0 ? Math.round((present / total) * 100) : 0,
        };
      }),
    };
  }

  async getProductivityIndex(filters: DashboardFilters, scope: DataScope): Promise<TrendSeries> {
    const where = this.buildScopeWhere(filters, scope);

    const records = await platformPrisma.attendanceAnalyticsDaily.findMany({
      where: {
        ...where,
        date: { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) },
      },
      orderBy: { date: 'asc' },
      distinct: ['date'],
    });

    return {
      key: 'productivity_index',
      label: 'Productivity Index',
      chartType: 'line',
      data: records.map((r: any) => ({
        date: r.date.toISOString().split('T')[0],
        value: this.safeNumber(r.productivityIndex),
      })),
    };
  }

  // ─── Leave ───

  async getLeaveUtilization(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<{
    avgBalance: number;
    utilizationPercent: number;
    pendingApprovals: number;
    encashmentLiability: number;
  }> {
    if (!tenantDb) {
      return { avgBalance: 0, utilizationPercent: 0, pendingApprovals: 0, encashmentLiability: 0 };
    }

    try {
      const balances = await tenantDb.leaveBalance.findMany({
        where: { companyId: scope.companyId },
      });

      const totalBalance = balances.reduce(
        (sum: number, b: any) => sum + this.safeNumber(b.balance),
        0,
      );
      const totalEntitled = balances.reduce(
        (sum: number, b: any) => sum + this.safeNumber(b.entitled),
        0,
      );
      const avgBalance = balances.length > 0 ? Math.round(totalBalance / balances.length) : 0;
      const utilizationPercent =
        totalEntitled > 0
          ? Math.round(((totalEntitled - totalBalance) / totalEntitled) * 100)
          : 0;

      const pendingApprovals = await tenantDb.leaveRequest.count({
        where: {
          companyId: scope.companyId,
          status: 'PENDING',
        },
      });

      // Encashment liability: sum of encashable balances (simplified)
      const encashmentLiability = balances.reduce(
        (sum: number, b: any) => sum + this.safeNumber(b.encashableBalance),
        0,
      );

      return { avgBalance, utilizationPercent, pendingApprovals, encashmentLiability };
    } catch (error) {
      logger.error('analytics_leave_utilization_error', { error, companyId: scope.companyId });
      return { avgBalance: 0, utilizationPercent: 0, pendingApprovals: 0, encashmentLiability: 0 };
    }
  }

  // ─── Payroll ───

  async getPayrollCostSummary(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    totalGross: number;
    totalDeductions: number;
    totalNetPay: number;
    employeeCount: number;
    avgCTC: number;
    previousMonthGross: number;
    momVariance: number;
    exceptions: number;
  }> {
    const where = this.buildScopeWhere(filters, scope);
    const dateTo = new Date(filters.dateTo);

    const latest = await this.getLatest<any>(platformPrisma.payrollAnalyticsMonthly, {
      ...where,
      month: dateTo.getMonth() + 1,
      year: dateTo.getFullYear(),
    });

    // Previous month
    const prevDate = new Date(dateTo);
    prevDate.setMonth(prevDate.getMonth() - 1);

    const previous = await this.getLatest<any>(platformPrisma.payrollAnalyticsMonthly, {
      ...where,
      month: prevDate.getMonth() + 1,
      year: prevDate.getFullYear(),
    });

    const totalGross = this.safeNumber(latest?.totalGrossEarnings);
    const previousGross = this.safeNumber(previous?.totalGrossEarnings);
    const momVariance =
      previousGross > 0 ? Math.round(((totalGross - previousGross) / previousGross) * 100) : 0;

    return {
      totalGross,
      totalDeductions: this.safeNumber(latest?.totalDeductions),
      totalNetPay: this.safeNumber(latest?.totalNetPay),
      employeeCount: this.safeNumber(latest?.employeesProcessed),
      avgCTC: this.safeNumber(latest?.avgCTC),
      previousMonthGross: previousGross,
      momVariance,
      exceptions: this.safeNumber(latest?.exceptionCount),
    };
  }

  async getPayrollTrend(filters: DashboardFilters, scope: DataScope): Promise<TrendSeries> {
    const where = this.buildScopeWhere(filters, scope);

    const records = await platformPrisma.payrollAnalyticsMonthly.findMany({
      where: {
        ...where,
        year: {
          gte: new Date(filters.dateFrom).getFullYear(),
          lte: new Date(filters.dateTo).getFullYear(),
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    return {
      key: 'payroll_cost_trend',
      label: 'Payroll Cost Trend',
      chartType: 'area',
      data: records.map((r: any) => ({
        date: `${r.year}-${String(r.month).padStart(2, '0')}-01`,
        value: this.safeNumber(r.totalGrossEarnings),
      })),
    };
  }

  async getCTCDistribution(filters: DashboardFilters, scope: DataScope): Promise<Distribution> {
    const where = this.buildScopeWhere(filters, scope);
    const dateTo = new Date(filters.dateTo);

    const latest = await this.getLatest<any>(platformPrisma.payrollAnalyticsMonthly, {
      ...where,
      month: dateTo.getMonth() + 1,
      year: dateTo.getFullYear(),
    });

    const breakdown = this.safeJson<{ label: string; count: number }[]>(latest?.byCTCBand, []);

    return {
      key: 'ctc_distribution',
      label: 'CTC Distribution',
      chartType: 'bar',
      data: breakdown.map((b) => ({ label: b.label, value: b.count })),
    };
  }

  async getStatutorySummary(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    pfAmount: number;
    esiAmount: number;
    tdsAmount: number;
    professionalTax: number;
    complianceScore: number;
  }> {
    const where = this.buildScopeWhere(filters, scope);
    const dateTo = new Date(filters.dateTo);

    const latest = await this.getLatest<any>(platformPrisma.payrollAnalyticsMonthly, {
      ...where,
      month: dateTo.getMonth() + 1,
      year: dateTo.getFullYear(),
    });

    return {
      pfAmount: this.safeNumber(latest?.pfContribution),
      esiAmount: this.safeNumber(latest?.esiContribution),
      tdsAmount: this.safeNumber(latest?.tdsDeducted),
      professionalTax: this.safeNumber(latest?.professionalTax),
      complianceScore: this.safeNumber(latest?.complianceScore),
    };
  }

  // ─── Attrition ───

  async getAttritionSummary(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<{
    attritionRate: number;
    voluntaryExits: number;
    involuntaryExits: number;
    avgTenureAtExit: number;
    totalExits: number;
    retentionRate: number;
    pendingFnF: number;
  }> {
    const where = this.buildScopeWhere(filters, scope);
    const dateTo = new Date(filters.dateTo);

    const latest = await this.getLatest<any>(platformPrisma.attritionMetricsMonthly, {
      ...where,
      month: dateTo.getMonth() + 1,
      year: dateTo.getFullYear(),
    });

    const attritionRate = this.safeNumber(latest?.attritionRate);

    return {
      attritionRate,
      voluntaryExits: this.safeNumber(latest?.voluntaryExits),
      involuntaryExits: this.safeNumber(latest?.involuntaryExits),
      avgTenureAtExit: this.safeNumber(latest?.avgTenureMonths),
      totalExits: this.safeNumber(latest?.totalExits),
      retentionRate: Math.max(0, 100 - attritionRate),
      pendingFnF: this.safeNumber(latest?.pendingFnFCount),
    };
  }

  async getAttritionTrend(filters: DashboardFilters, scope: DataScope): Promise<TrendSeries> {
    const where = this.buildScopeWhere(filters, scope);

    const records = await platformPrisma.attritionMetricsMonthly.findMany({
      where: {
        ...where,
        year: {
          gte: new Date(filters.dateFrom).getFullYear(),
          lte: new Date(filters.dateTo).getFullYear(),
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    return {
      key: 'attrition_trend',
      label: 'Attrition Trend',
      chartType: 'line',
      data: records.map((r: any) => ({
        date: `${r.year}-${String(r.month).padStart(2, '0')}-01`,
        value: this.safeNumber(r.attritionRate),
      })),
    };
  }

  async getFlightRiskEmployees(
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<Record<string, unknown>[]> {
    const where = this.buildScopeWhere(filters, scope);
    const dateTo = new Date(filters.dateTo);

    const latest = await this.getLatest<any>(platformPrisma.attritionMetricsMonthly, {
      ...where,
      month: dateTo.getMonth() + 1,
      year: dateTo.getFullYear(),
    });

    return this.safeJson<Record<string, unknown>[]>(latest?.flightRiskEmployees, []);
  }

  // ─── Recruitment (live tenant data) ───

  async getRecruitmentFunnel(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<{
    openPositions: number;
    pipelineCount: number;
    avgTimeToHire: number;
    acceptanceRate: number;
    funnel: Distribution;
  }> {
    if (!tenantDb) {
      return {
        openPositions: 0,
        pipelineCount: 0,
        avgTimeToHire: 0,
        acceptanceRate: 0,
        funnel: { key: 'recruitment_funnel', label: 'Recruitment Funnel', chartType: 'funnel', data: [] },
      };
    }

    try {
      const openPositions = await tenantDb.jobRequisition.count({
        where: {
          companyId: scope.companyId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      });

      const candidates = await tenantDb.candidate.findMany({
        where: { companyId: scope.companyId },
        select: { stage: true, createdAt: true, hiredAt: true },
      });

      const pipelineCount = candidates.length;
      const hiredCandidates = candidates.filter((c: any) => c.hiredAt);
      const offeredCandidates = candidates.filter(
        (c: any) => c.stage === 'OFFERED' || c.stage === 'HIRED',
      );
      const acceptanceRate =
        offeredCandidates.length > 0
          ? Math.round((hiredCandidates.length / offeredCandidates.length) * 100)
          : 0;

      // Average time-to-hire in days
      let avgTimeToHire = 0;
      if (hiredCandidates.length > 0) {
        const totalDays = hiredCandidates.reduce((sum: number, c: any) => {
          const diff = new Date(c.hiredAt).getTime() - new Date(c.createdAt).getTime();
          return sum + diff / (1000 * 60 * 60 * 24);
        }, 0);
        avgTimeToHire = Math.round(totalDays / hiredCandidates.length);
      }

      // Funnel stages
      const stageCounts: Record<string, number> = {};
      for (const c of candidates) {
        const stage = (c as any).stage ?? 'UNKNOWN';
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
      }

      const funnelOrder = ['APPLIED', 'SCREENED', 'INTERVIEWED', 'OFFERED', 'HIRED', 'REJECTED'];
      const funnel: Distribution = {
        key: 'recruitment_funnel',
        label: 'Recruitment Funnel',
        chartType: 'funnel',
        data: funnelOrder
          .filter((s) => (stageCounts[s] ?? 0) > 0)
          .map((s) => ({ label: s, value: stageCounts[s] ?? 0 })),
      };

      return { openPositions, pipelineCount, avgTimeToHire, acceptanceRate, funnel };
    } catch (error) {
      logger.error('analytics_recruitment_funnel_error', { error, companyId: scope.companyId });
      return {
        openPositions: 0,
        pipelineCount: 0,
        avgTimeToHire: 0,
        acceptanceRate: 0,
        funnel: { key: 'recruitment_funnel', label: 'Recruitment Funnel', chartType: 'funnel', data: [] },
      };
    }
  }

  // ─── Performance (live tenant data) ───

  async getAppraisalStatus(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<{
    completionPercent: number;
    avgRating: number;
    totalEntries: number;
    completedEntries: number;
  }> {
    if (!tenantDb) {
      return { completionPercent: 0, avgRating: 0, totalEntries: 0, completedEntries: 0 };
    }

    try {
      const entries = await tenantDb.appraisalEntry.findMany({
        where: { companyId: scope.companyId },
        select: { status: true, finalRating: true },
      });

      const totalEntries = entries.length;
      const completedEntries = entries.filter(
        (e: any) => e.status === 'COMPLETED' || e.status === 'APPROVED',
      ).length;
      const completionPercent =
        totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;

      const ratedEntries = entries.filter(
        (e: any) => typeof e.finalRating === 'number' && e.finalRating > 0,
      );
      const avgRating =
        ratedEntries.length > 0
          ? Math.round(
              (ratedEntries.reduce((s: number, e: any) => s + e.finalRating, 0) /
                ratedEntries.length) *
                10,
            ) / 10
          : 0;

      return { completionPercent, avgRating, totalEntries, completedEntries };
    } catch (error) {
      logger.error('analytics_appraisal_status_error', { error, companyId: scope.companyId });
      return { completionPercent: 0, avgRating: 0, totalEntries: 0, completedEntries: 0 };
    }
  }
}

export const analyticsService = new AnalyticsService();
