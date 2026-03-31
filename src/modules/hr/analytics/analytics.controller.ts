import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error.middleware';
import { createSuccessResponse } from '@/shared/utils';
import { ApiError } from '@/shared/errors';
import { cacheRedis } from '@/config/redis';
import { logger } from '@/config/logger';
import { platformPrisma, createTenantPrisma } from '@/config/database';
import { dashboardOrchestratorService } from './services/dashboard-orchestrator.service';
import { drilldownService } from './services/drilldown.service';
import { alertService } from './alerts/alert.service';
import { analyticsAuditService } from './services/analytics-audit.service';
import { analyticsCronService } from './services/analytics-cron.service';
import { normalizeFilters } from './filters-normalizer';
import {
  dashboardFiltersSchema,
  drilldownFiltersSchema,
  exportFiltersSchema,
  recomputeSchema,
} from './analytics.validators';
import { VALID_REPORT_TYPES } from './exports/report-definitions';
import type { DashboardName, DataScope, DashboardFilters } from './analytics.types';
import { reportAccessService } from './services/report-access.service';

// ─── Report Generators ───
import { generateEmployeeMasterReport, generateHeadcountMovementReport, generateDemographicsReport } from './exports/reports/workforce-reports';
import { generateAttendanceRegister, generateLateComingReport, generateOvertimeReport, generateAbsenteeismReport } from './exports/reports/attendance-reports';
import { generateLeaveBalanceReport, generateLeaveUtilizationReport, generateLeaveEncashmentReport } from './exports/reports/leave-reports';
import { generateSalaryRegister, generateBankTransferFile, generateCTCDistributionReport, generateSalaryRevisionReport, generateLoanOutstandingReport } from './exports/reports/payroll-reports';
import { generatePFECRReport, generateESIChallanReport, generatePTReport, generateTDSSummaryReport, generateGratuityLiabilityReport } from './exports/reports/statutory-reports';
import { generateAppraisalSummaryReport, generateSkillGapReport } from './exports/reports/performance-reports';
import { generateAttritionReport, generateFnFSettlementReport } from './exports/reports/attrition-reports';
import { generateComplianceSummaryReport } from './exports/reports/compliance-reports';

// ─── Valid Dashboard Names ───
const VALID_DASHBOARDS: DashboardName[] = [
  'executive', 'workforce', 'attendance', 'leave', 'payroll',
  'compliance', 'performance', 'recruitment', 'attrition',
];

// ─── Report Type → Generator Map ───
const REPORT_GENERATOR_MAP: Record<string, (tenantDb: any, companyName: string, filters: DashboardFilters, scope: DataScope) => Promise<Buffer>> = {
  'employee-master': generateEmployeeMasterReport,
  'headcount-movement': generateHeadcountMovementReport,
  demographics: generateDemographicsReport,
  'attendance-register': generateAttendanceRegister,
  'late-coming': generateLateComingReport,
  overtime: generateOvertimeReport,
  absenteeism: generateAbsenteeismReport,
  'leave-balance': generateLeaveBalanceReport,
  'leave-utilization': generateLeaveUtilizationReport,
  'leave-encashment': generateLeaveEncashmentReport,
  'salary-register': generateSalaryRegister,
  'bank-transfer': generateBankTransferFile,
  'ctc-distribution': generateCTCDistributionReport,
  'salary-revision': generateSalaryRevisionReport,
  'loan-outstanding': generateLoanOutstandingReport,
  'pf-ecr': generatePFECRReport,
  'esi-challan': generateESIChallanReport,
  'professional-tax': generatePTReport,
  'tds-summary': generateTDSSummaryReport,
  'gratuity-liability': generateGratuityLiabilityReport,
  'appraisal-summary': generateAppraisalSummaryReport,
  'skill-gap': generateSkillGapReport,
  attrition: generateAttritionReport,
  'fnf-settlement': generateFnFSettlementReport,
  'compliance-summary': generateComplianceSummaryReport,
};

// ─── Controller ───

class AnalyticsController {
  // ── GET /analytics/dashboard/:dashboard ───────────────────────────────

  getDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const dashboard = req.params.dashboard as DashboardName;
    if (!VALID_DASHBOARDS.includes(dashboard)) {
      throw ApiError.badRequest(`Invalid dashboard: ${dashboard}. Valid: ${VALID_DASHBOARDS.join(', ')}`);
    }

    const parsed = dashboardFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const role = req.user?.roleId ?? 'COMPANY_ADMIN';
    const result = await dashboardOrchestratorService.getDashboard(
      dashboard,
      parsed.data,
      userId,
      companyId,
      role,
    );

    // Orchestrator already wraps in success envelope
    res.json(result);
  });

  // ── GET /analytics/drilldown/:dashboard ───────────────────────────────

  getDrilldown = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const dashboard = req.params.dashboard;
    const parsed = drilldownFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const filters = normalizeFilters(parsed.data);
    const role = req.user?.roleId ?? 'COMPANY_ADMIN';
    const scope = await reportAccessService.resolveScope(userId, companyId, role as any, dashboard as DashboardName);

    const result = await drilldownService.getDrilldown(
      dashboard,
      parsed.data.type,
      filters,
      scope,
    );

    // Fire-and-forget audit log
    analyticsAuditService.logDrilldown(userId, companyId, dashboard, parsed.data.type).catch(() => {});

    res.json(createSuccessResponse(result.data, 'Drilldown loaded', result.meta));
  });

  // ── GET /analytics/export/:reportType ─────────────────────────────────

  exportReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    // Rate limiting: max 20 exports per hour per user
    const rateLimitKey = `export_rate:${userId}`;
    const currentCount = await cacheRedis.incr(rateLimitKey);
    if (currentCount === 1) {
      await cacheRedis.expire(rateLimitKey, 3600);
    }
    if (currentCount > 20) {
      throw ApiError.badRequest('Export rate limit exceeded. Maximum 20 exports per hour.');
    }

    const reportType = req.params.reportType;
    if (!VALID_REPORT_TYPES.includes(reportType)) {
      throw ApiError.badRequest(`Invalid report type: ${reportType}. Valid: ${VALID_REPORT_TYPES.join(', ')}`);
    }

    const parsed = exportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const filters = normalizeFilters(parsed.data);
    const role = req.user?.roleId ?? 'COMPANY_ADMIN';
    const scope = await reportAccessService.resolveScope(userId, companyId, role as any, 'executive' as DashboardName);

    // Get tenant DB for report generation
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      select: { schemaName: true },
    });
    if (!tenant) throw ApiError.notFound('Tenant not found');
    const tenantDb = createTenantPrisma(tenant.schemaName);

    // Get company name for report header
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name ?? 'Unknown Company';

    // Route to correct report generator
    const generator = REPORT_GENERATOR_MAP[reportType];
    if (!generator) {
      throw ApiError.badRequest(`No generator found for report type: ${reportType}`);
    }

    const buffer = await generator(tenantDb, companyName, filters, scope);

    // Set response headers for xlsx download
    const filename = `${reportType}-${filters.dateFrom}-to-${filters.dateTo}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Fire-and-forget audit log
    analyticsAuditService.logExport(userId, companyId, reportType, parsed.data.format).catch(() => {});

    res.send(buffer);
  });

  // ── GET /analytics/alerts ─────────────────────────────────────────────

  getAlerts = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const dashboard = req.query.dashboard as DashboardName | undefined;
    const alerts = await alertService.getActiveAlerts(companyId, dashboard);
    res.json(createSuccessResponse(alerts, 'Alerts retrieved'));
  });

  // ── POST /analytics/alerts/:id/acknowledge ────────────────────────────

  acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const alertId = req.params.id;
    if (!alertId) throw ApiError.badRequest('Alert ID is required');

    const result = await alertService.acknowledgeAlert(alertId, userId);
    res.json(createSuccessResponse(result, 'Alert acknowledged'));
  });

  // ── POST /analytics/alerts/:id/resolve ────────────────────────────────

  resolveAlert = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const alertId = req.params.id;
    if (!alertId) throw ApiError.badRequest('Alert ID is required');

    const result = await alertService.resolveAlert(alertId, userId);
    res.json(createSuccessResponse(result, 'Alert resolved'));
  });

  // ── POST /analytics/recompute ─────────────────────────────────────────

  recompute = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = recomputeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const date = parsed.data.date ? new Date(parsed.data.date) : new Date();

    logger.info('analytics_recompute_triggered', { companyId, date: date.toISOString() });
    await analyticsCronService.recomputeForCompany(companyId, date);

    res.json(createSuccessResponse({ recomputed: true }, 'Analytics recomputation complete'));
  });
}

export const analyticsController = new AnalyticsController();
