import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { ApiError } from '../../../shared/errors';
import { cacheRedis } from '../../../config/redis';
import { logger } from '../../../config/logger';
import { platformPrisma, tenantConnectionManager } from '../../../config/database';
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
import { VALID_REPORT_TYPES, REPORT_DEFINITIONS, REPORT_DESCRIPTIONS } from './exports/report-definitions';
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
  'compliance', 'performance', 'recruitment', 'attrition', 'training',
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

    const dashboard = req.params.dashboard as string;
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

    res.json(createSuccessResponse(result.data, 'Drilldown loaded'));
  });

  // ── GET /analytics/export/:reportType ─────────────────────────────────

  exportReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    // Rate limiting: max 20 exports per hour per user
    try {
      const rateLimitKey = `export_rate:${userId}`;
      const currentCount = await cacheRedis.incr(rateLimitKey);
      if (currentCount === 1) {
        await cacheRedis.expire(rateLimitKey, 3600);
      }
      if (currentCount > 20) {
        throw ApiError.badRequest('Export rate limit exceeded. Max 20 per hour.');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.warn('Rate limit check failed, allowing request', { error: (err as Error).message });
    }

    const reportType = req.params.reportType as string;
    if (!VALID_REPORT_TYPES.includes(reportType)) {
      throw ApiError.badRequest(`Invalid report type: ${reportType}. Valid: ${VALID_REPORT_TYPES.join(', ')}`);
    }

    const parsed = exportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { format: exportFormat, ...rawFilters } = parsed.data;
    const filters = normalizeFilters(rawFilters);
    const role = req.user?.roleId ?? 'COMPANY_ADMIN';
    const scope = await reportAccessService.resolveScope(userId, companyId, role as any, 'executive' as DashboardName);

    // Get tenant DB for report generation
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      select: { schemaName: true },
    });
    if (!tenant) throw ApiError.notFound('Tenant not found');

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

    // Reports query employees, attendance, payroll etc. which are in the platform DB (public schema)
    // Pass platformPrisma as the DB client since all HR tables are in the public schema
    const buffer = await generator(platformPrisma, companyName, filters, scope);

    // Set response headers for xlsx download
    const filename = `${reportType}-${filters.dateFrom}-to-${filters.dateTo}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Fire-and-forget audit log
    analyticsAuditService.logExport(userId, companyId, reportType, exportFormat).catch(() => {});

    // Fire-and-forget report history record
    platformPrisma.reportHistory.create({
      data: {
        companyId,
        userId,
        userName: req.user?.firstName ? `${req.user.firstName}${req.user.lastName ? ` ${req.user.lastName}` : ''}` : 'Unknown',
        reportType,
        reportTitle: REPORT_DEFINITIONS[reportType]?.title || reportType,
        category: REPORT_DEFINITIONS[reportType]?.category || 'unknown',
        filters: parsed.data as any,
        format: exportFormat,
        status: 'COMPLETED',
        fileSize: buffer.length,
      },
    }).catch((err) => logger.error('report_history_save_failed', { error: (err as Error).message, reportType }));

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

    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const alertId = req.params.id;
    if (!alertId) throw ApiError.badRequest('Alert ID is required');

    await alertService.acknowledgeAlert(alertId, userId, companyId);
    res.json(createSuccessResponse({ acknowledged: true }, 'Alert acknowledged'));
  });

  // ── POST /analytics/alerts/:id/resolve ────────────────────────────────

  resolveAlert = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const alertId = req.params.id;
    if (!alertId) throw ApiError.badRequest('Alert ID is required');

    await alertService.resolveAlert(alertId, userId, companyId);
    res.json(createSuccessResponse({ resolved: true }, 'Alert resolved'));
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
  // ── GET /analytics/reports/catalog ──────────────────────────────────

  getReportCatalog = asyncHandler(async (req: Request, res: Response) => {
    const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
      Workforce: { icon: 'users', color: '#6366F1', label: 'Workforce Reports' },
      Attendance: { icon: 'clock', color: '#10B981', label: 'Attendance Reports' },
      Leave: { icon: 'calendar-off', color: '#F59E0B', label: 'Leave Reports' },
      Payroll: { icon: 'indian-rupee', color: '#3B82F6', label: 'Payroll Reports' },
      Statutory: { icon: 'shield', color: '#8B5CF6', label: 'Statutory Reports' },
      Performance: { icon: 'target', color: '#EC4899', label: 'Performance Reports' },
      Attrition: { icon: 'user-minus', color: '#EF4444', label: 'Attrition Reports' },
      Compliance: { icon: 'shield-check', color: '#14B8A6', label: 'Compliance Reports' },
    };

    const catalog: Record<
      string,
      {
        meta: { icon: string; color: string; label: string };
        reports: Array<{ key: string; title: string; sheetNames: string[]; description: string }>;
      }
    > = {};

    for (const [_key, def] of Object.entries(REPORT_DEFINITIONS)) {
      if (!catalog[def.category]) {
        catalog[def.category] = {
          meta: CATEGORY_META[def.category] ?? { icon: 'file', color: '#6B7280', label: def.category },
          reports: [],
        };
      }
      catalog[def.category]!.reports.push({
        key: def.key,
        title: def.title,
        sheetNames: def.sheetNames,
        description: REPORT_DESCRIPTIONS[def.key] ?? '',
      });
    }

    res.json(createSuccessResponse(catalog, 'Report catalog'));
  });

  // ── GET /analytics/reports/history ────────────────────────────────────

  getReportHistory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.unauthorized('Authentication required');

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const reportType = req.query.reportType as string | undefined;
    const category = req.query.category as string | undefined;

    const where: any = { companyId };
    if (reportType) where.reportType = reportType;
    if (category) where.category = category;

    const [records, total] = await Promise.all([
      platformPrisma.reportHistory.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      platformPrisma.reportHistory.count({ where }),
    ]);

    res.json(createPaginatedResponse(records, page, limit, total, 'Report history'));
  });

  // ── GET /analytics/reports/rate-limit ─────────────────────────────────

  getRateLimit = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    try {
      const rateLimitKey = `export_rate:${userId}`;
      const used = parseInt(await cacheRedis.get(rateLimitKey) || '0');
      const ttl = await cacheRedis.ttl(rateLimitKey);

      res.json(createSuccessResponse({
        used,
        limit: 20,
        remaining: Math.max(0, 20 - used),
        resetsInSeconds: ttl > 0 ? ttl : 0,
      }, 'Rate limit status'));
    } catch (err) {
      logger.warn('Rate limit status check failed, returning defaults', { error: (err as Error).message });
      res.json(createSuccessResponse({
        used: 0,
        limit: 20,
        remaining: 20,
        resetsInSeconds: 0,
      }, 'Rate limit status'));
    }
  });
}

export const analyticsController = new AnalyticsController();
