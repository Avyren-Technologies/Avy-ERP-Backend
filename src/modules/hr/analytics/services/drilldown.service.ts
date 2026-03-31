import { platformPrisma, createTenantPrisma } from '@/config/database';
import { logger } from '@/config/logger';
import type { DashboardFilters, DataScope, PaginatedReport } from '../analytics.types';
import { analyticsService } from './analytics.service';

// ─── Drilldown Route Map ───

type DrilldownHandler = (
  filters: DashboardFilters,
  scope: DataScope,
  tenantDb: any,
) => Promise<PaginatedReport>;

// ─── Drilldown Service ───

class DrilldownService {
  private routes: Record<string, DrilldownHandler>;

  constructor() {
    this.routes = {
      'attendance:register': this.attendanceRegister.bind(this),
      'attendance:lateEmployees': this.attendanceLateEmployees.bind(this),
      'attendance:overtime': this.attendanceOvertime.bind(this),
      'attendance:absenteeism': this.attendanceAbsenteeism.bind(this),
      'attrition:exitDetail': this.attritionExitDetail.bind(this),
      'attrition:flightRisk': this.attritionFlightRisk.bind(this),
      'attrition:fnfTracker': this.attritionFnfTracker.bind(this),
      'workforce:employeeDirectory': this.workforceEmployeeDirectory.bind(this),
      'payroll:salaryRegister': this.payrollSalaryRegister.bind(this),
      'payroll:loanOutstanding': this.payrollLoanOutstanding.bind(this),
      'leave:leaveBalance': this.leaveBalance.bind(this),
      'leave:pendingApprovals': this.leavePendingApprovals.bind(this),
      'compliance:filingTracker': this.complianceFilingTracker.bind(this),
      'compliance:grievanceCases': this.complianceGrievanceCases.bind(this),
      'performance:appraisalDetail': this.performanceAppraisalDetail.bind(this),
      'performance:skillGap': this.performanceSkillGap.bind(this),
      'recruitment:candidatePipeline': this.recruitmentCandidatePipeline.bind(this),
      'recruitment:requisitionTracker': this.recruitmentRequisitionTracker.bind(this),
    };
  }

  // ─── Main Entry Point ───

  async getDrilldown(
    dashboard: string,
    type: string,
    filters: DashboardFilters,
    scope: DataScope,
  ): Promise<PaginatedReport> {
    const routeKey = `${dashboard}:${type}`;
    const handler = this.routes[routeKey];

    if (!handler) {
      logger.warn('drilldown_unknown_type', { routeKey });
      return this.emptyReport(filters);
    }

    let tenantDb: any = null;
    try {
      tenantDb = await this.getTenantPrisma(scope.companyId);
      return await handler(filters, scope, tenantDb);
    } catch (error) {
      logger.error('drilldown_error', { routeKey, error, companyId: scope.companyId });
      return this.emptyReport(filters);
    } finally {
      if (tenantDb) {
        tenantDb.$disconnect().catch(() => {});
      }
    }
  }

  // ─── Attendance Drilldowns ───

  private async attendanceRegister(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where = this.buildAttendanceWhere(filters, scope);
    const [data, total] = await Promise.all([
      tenantDb.attendanceRecord.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { date: filters.sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.attendanceRecord.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async attendanceLateEmployees(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where = {
      ...this.buildAttendanceWhere(filters, scope),
      lateMinutes: { gt: 0 },
    };

    const [data, total] = await Promise.all([
      tenantDb.attendanceRecord.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { lateMinutes: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.attendanceRecord.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async attendanceOvertime(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where = {
      ...this.buildAttendanceWhere(filters, scope),
      overtimeHours: { gt: 0 },
    };

    const [data, total] = await Promise.all([
      tenantDb.attendanceRecord.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { overtimeHours: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.attendanceRecord.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async attendanceAbsenteeism(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where = {
      ...this.buildAttendanceWhere(filters, scope),
      status: 'ABSENT',
    };

    const [data, total] = await Promise.all([
      tenantDb.attendanceRecord.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { date: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.attendanceRecord.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Attrition Drilldowns ───

  private async attritionExitDetail(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      lastWorkingDate: {
        gte: new Date(filters.dateFrom),
        lte: new Date(filters.dateTo),
      },
    };

    const [data, total] = await Promise.all([
      tenantDb.exitRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { lastWorkingDate: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.exitRequest.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async attritionFlightRisk(
    filters: DashboardFilters,
    scope: DataScope,
    _tenantDb: any,
  ): Promise<PaginatedReport> {
    // Flight risk data comes from precomputed analytics
    const flightRiskEmployees = await analyticsService.getFlightRiskEmployees(filters, scope);

    const page = filters.page;
    const limit = filters.limit;
    const start = (page - 1) * limit;
    const paged = flightRiskEmployees.slice(start, start + limit);

    return {
      data: paged,
      meta: {
        page,
        limit,
        total: flightRiskEmployees.length,
        totalPages: Math.ceil(flightRiskEmployees.length / limit) || 1,
      },
    };
  }

  private async attritionFnfTracker(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      status: { not: 'PAID' },
    };

    const [data, total] = await Promise.all([
      tenantDb.fnfSettlement.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.fnfSettlement.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Workforce Drilldowns ───

  private async workforceEmployeeDirectory(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      status: { notIn: ['EXITED'] },
    };

    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.gradeId) where.gradeId = filters.gradeId;

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { employeeCode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      tenantDb.employee.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          status: true,
          joiningDate: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
          grade: { select: { name: true } },
          designation: { select: { name: true } },
        },
        orderBy: { [filters.sortBy === 'name' ? 'firstName' : 'createdAt']: filters.sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.employee.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Payroll Drilldowns ───

  private async payrollSalaryRegister(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const dateTo = new Date(filters.dateTo);
    const month = dateTo.getMonth() + 1;
    const year = dateTo.getFullYear();

    // Find payroll run for the month
    const payrollRun = await tenantDb.payrollRun.findUnique({
      where: {
        companyId_month_year: {
          companyId: scope.companyId,
          month,
          year,
        },
      },
      select: { id: true },
    });

    if (!payrollRun) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      payrollRunId: payrollRun.id,
    };

    const [data, total] = await Promise.all([
      tenantDb.payrollEntry.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: filters.sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.payrollEntry.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async payrollLoanOutstanding(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      status: 'ACTIVE',
    };

    const [data, total] = await Promise.all([
      tenantDb.loanRecord.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.loanRecord.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Leave Drilldowns ───

  private async leaveBalance(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    const [data, total] = await Promise.all([
      tenantDb.leaveBalance.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          leaveType: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.leaveBalance.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async leavePendingApprovals(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      status: 'PENDING',
    };

    const [data, total] = await Promise.all([
      tenantDb.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          leaveType: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.leaveRequest.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Compliance Drilldowns ───

  private async complianceFilingTracker(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    const [data, total] = await Promise.all([
      tenantDb.statutoryFiling.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.statutoryFiling.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async complianceGrievanceCases(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    const [data, total] = await Promise.all([
      tenantDb.grievance.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.grievance.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Performance Drilldowns ───

  private async performanceAppraisalDetail(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    const [data, total] = await Promise.all([
      tenantDb.appraisalEntry.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.appraisalEntry.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async performanceSkillGap(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      gap: { gt: 0 },
    };

    const [data, total] = await Promise.all([
      tenantDb.employeeSkillMapping.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          skill: { select: { name: true } },
        },
        orderBy: { gap: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.employeeSkillMapping.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Recruitment Drilldowns ───

  private async recruitmentCandidatePipeline(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      tenantDb.candidate.findMany({
        where,
        include: {
          jobRequisition: { select: { title: true, department: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.candidate.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  private async recruitmentRequisitionTracker(
    filters: DashboardFilters,
    scope: DataScope,
    tenantDb: any,
  ): Promise<PaginatedReport> {
    if (!tenantDb) return this.emptyReport(filters);

    const where: Record<string, unknown> = {
      companyId: scope.companyId,
    };

    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      tenantDb.jobRequisition.findMany({
        where,
        include: {
          department: { select: { name: true } },
          _count: { select: { candidates: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tenantDb.jobRequisition.count({ where }),
    ]);

    return this.paginate(data, total, filters);
  }

  // ─── Internal Helpers ───

  private async getTenantPrisma(companyId: string): Promise<any | null> {
    try {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { companyId },
        select: { schemaName: true },
      });
      if (!tenant) return null;
      return createTenantPrisma(tenant.schemaName);
    } catch {
      return null;
    }
  }

  private buildAttendanceWhere(
    filters: DashboardFilters,
    scope: DataScope,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      companyId: scope.companyId,
      date: {
        gte: new Date(filters.dateFrom),
        lte: new Date(filters.dateTo),
      },
    };
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.locationId) where.locationId = filters.locationId;
    return where;
  }

  private paginate<T>(data: T[], total: number, filters: DashboardFilters): PaginatedReport<T> {
    return {
      data,
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit) || 1,
      },
    };
  }

  private emptyReport(filters: DashboardFilters): PaginatedReport {
    return {
      data: [],
      meta: {
        page: filters.page,
        limit: filters.limit,
        total: 0,
        totalPages: 1,
      },
    };
  }
}

export const drilldownService = new DrilldownService();
