import { logger } from '../../../../config/logger';
import type { DashboardName, Insight, InsightCategory, InsightRule } from '../analytics.types';
import { detectAnomaly } from './anomaly/anomaly-detector';
import { attritionRules } from './rules/attrition.rules';
import { attendanceRules } from './rules/attendance.rules';
import { payrollRules } from './rules/payroll.rules';
import { complianceRules } from './rules/compliance.rules';
import { performanceRules } from './rules/performance.rules';
import { recruitmentRules } from './rules/recruitment.rules';

const SEVERITY_ORDER: Record<InsightCategory, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

const MAX_INSIGHTS = 5;

/**
 * Map dashboards to their applicable rule sets.
 * Executive dashboard gets the top rules from attrition + attendance + payroll.
 */
const DASHBOARD_RULES: Record<DashboardName, InsightRule[]> = {
  executive: [...attritionRules, ...attendanceRules, ...payrollRules],
  workforce: [...attritionRules],
  attendance: [...attendanceRules],
  leave: [...attendanceRules],
  payroll: [...payrollRules],
  compliance: [...complianceRules],
  performance: [...performanceRules],
  recruitment: [...recruitmentRules],
  attrition: [...attritionRules],
};

class InsightsEngineService {
  /**
   * Generate insights for a dashboard by running applicable rules
   * and anomaly detection on historical data.
   */
  generateInsights(
    dashboard: DashboardName,
    currentData: Record<string, unknown>,
    historicalData?: Record<string, number[]>,
  ): Insight[] {
    const insights: Insight[] = [];

    // Run rule-based insights
    const rules = DASHBOARD_RULES[dashboard] ?? [];
    for (const rule of rules) {
      try {
        if (rule.evaluate(currentData)) {
          const generated = rule.generate(currentData);
          insights.push({
            id: rule.id,
            dashboard,
            metric: rule.id,
            currentValue: 0,
            ...generated,
          });
        }
      } catch (error) {
        logger.error(`Insight rule ${rule.id} failed:`, error);
      }
    }

    // Run anomaly detection on historical data
    if (historicalData) {
      for (const [metric, historicalValues] of Object.entries(historicalData)) {
        try {
          const currentValue = currentData[metric];
          if (typeof currentValue !== 'number') continue;

          const result = detectAnomaly(currentValue, historicalValues);
          if (result.isAnomaly) {
            insights.push({
              id: `anomaly-${metric}`,
              dashboard,
              category: result.severity === 'HIGH' ? 'critical' : 'warning',
              title: `Anomaly Detected: ${this.formatMetricName(metric)}`,
              description: `${this.formatMetricName(metric)} is ${result.direction === 'ABOVE' ? 'above' : 'below'} normal range (z-score: ${result.zScore}). Historical pattern deviation detected.`,
              metric,
              currentValue,
              actionable: false,
              drilldownType: `anomaly-${metric}`,
            });
          }
        } catch (error) {
          logger.error(`Anomaly detection failed for metric ${metric}:`, error);
        }
      }
    }

    return this.rankInsights(insights);
  }

  /**
   * Rank insights by severity (critical > warning > info > positive),
   * then by a simple magnitude heuristic, and cap at MAX_INSIGHTS.
   */
  rankInsights(insights: Insight[]): Insight[] {
    return insights
      .sort((a, b) => {
        const severityDiff = SEVERITY_ORDER[a.category] - SEVERITY_ORDER[b.category];
        if (severityDiff !== 0) return severityDiff;
        // Secondary sort: actionable items first
        if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
        return 0;
      })
      .slice(0, MAX_INSIGHTS);
  }

  /**
   * Format a camelCase or snake_case metric name into a readable string.
   */
  private formatMetricName(metric: string): string {
    return metric
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\s/, '')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
}

export const insightsEngineService = new InsightsEngineService();
