import type { DashboardName } from '@/modules/hr/analytics/analytics.types';

export interface AlertRuleDefinition {
  type: string;
  dashboard: DashboardName;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evaluate: (data: Record<string, unknown>) => boolean;
  title: (data: Record<string, unknown>) => string;
  description: (data: Record<string, unknown>) => string;
  expiresInHours: number;
}

export const ALERT_RULES: AlertRuleDefinition[] = [
  {
    type: 'attrition_spike',
    dashboard: 'attrition',
    severity: 'CRITICAL',
    evaluate: (data) => {
      const rate = data['attritionRate'] as number | undefined;
      const prevRate = data['prevAttritionRate'] as number | undefined;
      if (typeof rate !== 'number' || typeof prevRate !== 'number' || prevRate === 0) return false;
      return ((rate - prevRate) / prevRate) * 100 > 25;
    },
    title: () => 'Attrition Spike Detected',
    description: (data) =>
      `Attrition rate spiked to ${(data['attritionRate'] as number).toFixed(1)}% from ${(data['prevAttritionRate'] as number).toFixed(1)}%. Investigate root causes immediately.`,
    expiresInHours: 168, // 7 days
  },
  {
    type: 'compliance_overdue',
    dashboard: 'compliance',
    severity: 'HIGH',
    evaluate: (data) => {
      const count = data['overdueFilings'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    title: () => 'Overdue Compliance Filings',
    description: (data) =>
      `${data['overdueFilings'] as number} statutory filing(s) are past their due date. Penalties may apply.`,
    expiresInHours: 72,
  },
  {
    type: 'payroll_anomaly',
    dashboard: 'payroll',
    severity: 'HIGH',
    evaluate: (data) => {
      const variance = data['costVariancePercent'] as number | undefined;
      return typeof variance === 'number' && Math.abs(variance) > 20;
    },
    title: () => 'Payroll Cost Anomaly',
    description: (data) =>
      `Payroll cost variance is ${Math.abs(data['costVariancePercent'] as number).toFixed(1)}%, significantly outside normal range.`,
    expiresInHours: 48,
  },
  {
    type: 'attendance_drop',
    dashboard: 'attendance',
    severity: 'MEDIUM',
    evaluate: (data) => {
      const rate = data['attendanceRate'] as number | undefined;
      return typeof rate === 'number' && rate < 65;
    },
    title: () => 'Attendance Rate Drop',
    description: (data) =>
      `Overall attendance has dropped to ${(data['attendanceRate'] as number).toFixed(1)}%. Check for organizational or seasonal factors.`,
    expiresInHours: 48,
  },
  {
    type: 'approval_backlog',
    dashboard: 'executive',
    severity: 'MEDIUM',
    evaluate: (data) => {
      const count = data['pendingApprovals'] as number | undefined;
      return typeof count === 'number' && count > 50;
    },
    title: () => 'Approval Backlog',
    description: (data) =>
      `${data['pendingApprovals'] as number} approvals are pending. Delays may affect employee satisfaction and operations.`,
    expiresInHours: 24,
  },
  {
    type: 'grievance_sla',
    dashboard: 'compliance',
    severity: 'HIGH',
    evaluate: (data) => {
      const breachPercent = data['grievanceSlaBreachPercent'] as number | undefined;
      return typeof breachPercent === 'number' && breachPercent > 20;
    },
    title: () => 'Grievance SLA Breach',
    description: (data) =>
      `${(data['grievanceSlaBreachPercent'] as number).toFixed(1)}% of grievances have breached SLA. Escalate unresolved cases.`,
    expiresInHours: 72,
  },
  {
    type: 'min_wage_violation',
    dashboard: 'compliance',
    severity: 'CRITICAL',
    evaluate: (data) => {
      const count = data['minWageViolations'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    title: () => 'Minimum Wage Violations',
    description: (data) =>
      `${data['minWageViolations'] as number} employee(s) are paid below minimum wage. Legal compliance risk.`,
    expiresInHours: 24,
  },
  {
    type: 'high_overtime',
    dashboard: 'attendance',
    severity: 'MEDIUM',
    evaluate: (data) => {
      const hours = data['avgOvertimeHours'] as number | undefined;
      return typeof hours === 'number' && hours > 120;
    },
    title: () => 'Excessive Overtime Alert',
    description: (data) =>
      `Average overtime has reached ${Math.round(data['avgOvertimeHours'] as number)} hours. Risk of burnout and statutory violations.`,
    expiresInHours: 168,
  },
  {
    type: 'flight_risk',
    dashboard: 'attrition',
    severity: 'HIGH',
    evaluate: (data) => {
      const count = data['highFlightRiskCount'] as number | undefined;
      return typeof count === 'number' && count > 5;
    },
    title: () => 'Multiple Flight Risk Employees',
    description: (data) =>
      `${data['highFlightRiskCount'] as number} employees are flagged as high flight risk. Proactive retention actions needed.`,
    expiresInHours: 168,
  },
  {
    type: 'probation_expiry',
    dashboard: 'workforce',
    severity: 'LOW',
    evaluate: (data) => {
      const count = data['probationExpiringCount'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    title: () => 'Probation Periods Expiring',
    description: (data) =>
      `${data['probationExpiringCount'] as number} employee(s) have probation periods expiring soon. Initiate confirmation reviews.`,
    expiresInHours: 336, // 14 days
  },
];
