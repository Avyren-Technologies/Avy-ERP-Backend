import { platformPrisma } from '@/config/database';
import { logger } from '@/config/logger';

// ─── Audit Action Constants ───

const AUDIT_ACTIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  EXPORT_REPORT: 'EXPORT_REPORT',
  DRILLDOWN: 'DRILLDOWN',
  ACKNOWLEDGE_ALERT: 'ACKNOWLEDGE_ALERT',
  RESOLVE_ALERT: 'RESOLVE_ALERT',
} as const;

type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface RequestMeta {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

class AnalyticsAuditService {
  /**
   * Log a dashboard view event. Fire-and-forget — never throws.
   */
  async logView(
    userId: string,
    companyId: string,
    dashboard: string,
    filters?: Record<string, unknown>,
    req?: RequestMeta,
  ): Promise<void> {
    await this.writeLog({
      userId,
      companyId,
      action: AUDIT_ACTIONS.VIEW_DASHBOARD,
      dashboard,
      filters: filters ?? undefined,
      ipAddress: req?.ip,
      userAgent: this.extractUserAgent(req),
    });
  }

  /**
   * Log a report export event. Fire-and-forget — never throws.
   */
  async logExport(
    userId: string,
    companyId: string,
    reportType: string,
    format: string,
    filters?: Record<string, unknown>,
  ): Promise<void> {
    await this.writeLog({
      userId,
      companyId,
      action: AUDIT_ACTIONS.EXPORT_REPORT,
      reportType,
      exportFormat: format,
      filters: filters ?? undefined,
    });
  }

  /**
   * Log a drilldown navigation event. Fire-and-forget — never throws.
   */
  async logDrilldown(
    userId: string,
    companyId: string,
    dashboard: string,
    drilldownType: string,
  ): Promise<void> {
    await this.writeLog({
      userId,
      companyId,
      action: AUDIT_ACTIONS.DRILLDOWN,
      dashboard,
      reportType: drilldownType,
    });
  }

  /**
   * Log an alert acknowledgement or resolution. Fire-and-forget — never throws.
   */
  async logAlertAction(
    userId: string,
    companyId: string,
    alertId: string,
    action: 'acknowledge' | 'resolve',
  ): Promise<void> {
    const auditAction: AuditAction =
      action === 'acknowledge'
        ? AUDIT_ACTIONS.ACKNOWLEDGE_ALERT
        : AUDIT_ACTIONS.RESOLVE_ALERT;

    await this.writeLog({
      userId,
      companyId,
      action: auditAction,
      filters: { alertId } as unknown as Record<string, unknown>,
    });
  }

  // ─── Internal ───

  private async writeLog(data: {
    userId: string;
    companyId: string;
    action: string;
    dashboard?: string;
    reportType?: string;
    filters?: Record<string, unknown>;
    exportFormat?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await platformPrisma.analyticsAuditLog.create({
        data: {
          userId: data.userId,
          companyId: data.companyId,
          action: data.action,
          dashboard: data.dashboard ?? null,
          reportType: data.reportType ?? null,
          filters: data.filters ?? null,
          exportFormat: data.exportFormat ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
        },
      });
    } catch (error) {
      logger.error('Failed to write analytics audit log', {
        error,
        action: data.action,
        userId: data.userId,
        companyId: data.companyId,
      });
    }
  }

  private extractUserAgent(req?: RequestMeta): string | undefined {
    if (!req?.headers) return undefined;
    const ua = req.headers['user-agent'];
    return Array.isArray(ua) ? ua[0] : ua;
  }
}

export const analyticsAuditService = new AnalyticsAuditService();
