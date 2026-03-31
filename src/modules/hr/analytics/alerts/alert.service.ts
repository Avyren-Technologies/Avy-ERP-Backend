import { platformPrisma } from '../../../../config/database';
import { logger } from '../../../../config/logger';
import { Prisma } from '@prisma/client';
import type { DashboardName } from '../analytics.types';
import { ALERT_RULES } from './alert-rules';

class AlertService {
  /**
   * Evaluate alert rules for a given dashboard and create alerts.
   * Deduplicates: skips if an active alert of the same type already exists for the company.
   * Auto-resolves expired alerts.
   */
  async evaluateAndCreate(
    companyId: string,
    dashboard: DashboardName,
    analyticsData: Record<string, unknown>,
  ): Promise<void> {
    // Auto-resolve expired alerts first
    await this.autoResolveExpired(companyId);

    const matchingRules = ALERT_RULES.filter((rule) => rule.dashboard === dashboard);

    for (const rule of matchingRules) {
      try {
        const triggered = rule.evaluate(analyticsData);
        if (!triggered) continue;

        // Deduplicate: check for existing active alert of same type
        const existing = await platformPrisma.analyticsAlert.findFirst({
          where: {
            companyId,
            type: rule.type,
            status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
          },
        });

        if (existing) {
          logger.debug(`Alert ${rule.type} already active for company ${companyId}, skipping`);
          continue;
        }

        await platformPrisma.analyticsAlert.create({
          data: {
            companyId,
            dashboard,
            type: rule.type,
            severity: rule.severity,
            status: 'ACTIVE',
            title: rule.title(analyticsData),
            description: rule.description(analyticsData),
            metadata: analyticsData as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + rule.expiresInHours * 60 * 60 * 1000),
          },
        });

        logger.info(`Alert created: ${rule.type} for company ${companyId}`);
      } catch (error) {
        logger.error(`Failed to evaluate alert rule ${rule.type}:`, error);
      }
    }
  }

  /**
   * Get active alerts for a company, optionally filtered by dashboard.
   */
  async getActiveAlerts(companyId: string, dashboard?: DashboardName) {
    return platformPrisma.analyticsAlert.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
        ...(dashboard ? { dashboard } : {}),
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Acknowledge an alert (user has seen it).
   */
  async acknowledgeAlert(alertId: string, userId: string) {
    return platformPrisma.analyticsAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });
  }

  /**
   * Resolve an alert manually.
   */
  async resolveAlert(alertId: string, userId: string) {
    return platformPrisma.analyticsAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Auto-resolve alerts that have passed their expiry time.
   */
  private async autoResolveExpired(companyId: string): Promise<void> {
    try {
      await platformPrisma.analyticsAlert.updateMany({
        where: {
          companyId,
          status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
          expiresAt: { lte: new Date() },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to auto-resolve expired alerts:', error);
    }
  }
}

export const alertService = new AlertService();
