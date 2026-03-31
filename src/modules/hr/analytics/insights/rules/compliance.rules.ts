import type { InsightRule } from '../../analytics.types';

export const complianceRules: InsightRule[] = [
  {
    id: 'compliance-overdue-filings',
    evaluate: (data) => {
      const count = data['overdueFilings'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    generate: (data) => ({
      category: 'critical',
      title: 'Overdue Statutory Filings',
      description: `${data['overdueFilings'] as number} statutory filing(s) are overdue. Immediate action required to avoid penalties.`,
      actionable: true,
      drilldownType: 'compliance-filings',
    }),
  },
  {
    id: 'compliance-min-wage',
    evaluate: (data) => {
      const count = data['minWageViolations'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    generate: (data) => ({
      category: 'critical',
      title: 'Minimum Wage Violations',
      description: `${data['minWageViolations'] as number} employee(s) are below the minimum wage threshold. Rectify immediately.`,
      actionable: true,
      drilldownType: 'compliance-min-wage',
    }),
  },
  {
    id: 'compliance-grievance-sla',
    evaluate: (data) => {
      const breachPercent = data['grievanceSlaBreachPercent'] as number | undefined;
      return typeof breachPercent === 'number' && breachPercent > 10;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Grievance SLA Breach',
      description: `${(data['grievanceSlaBreachPercent'] as number).toFixed(1)}% of grievances exceed SLA timelines. Review resolution process.`,
      actionable: true,
      drilldownType: 'compliance-grievances',
    }),
  },
];
