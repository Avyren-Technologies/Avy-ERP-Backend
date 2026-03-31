import type { InsightRule } from '../../analytics.types';

export const payrollRules: InsightRule[] = [
  {
    id: 'payroll-cost-variance',
    evaluate: (data) => {
      const variance = data['costVariancePercent'] as number | undefined;
      return typeof variance === 'number' && Math.abs(variance) > 15;
    },
    generate: (data) => {
      const variance = data['costVariancePercent'] as number;
      const direction = variance > 0 ? 'increase' : 'decrease';
      return {
        category: 'warning',
        title: 'Payroll Cost Variance',
        description: `Payroll cost shows a ${Math.abs(variance).toFixed(1)}% ${direction} from budget, exceeding the 15% variance threshold.`,
        actionable: true,
        drilldownType: 'payroll-cost-breakdown',
      };
    },
  },
  {
    id: 'payroll-high-exceptions',
    evaluate: (data) => {
      const count = data['exceptionCount'] as number | undefined;
      const total = data['totalProcessed'] as number | undefined;
      if (typeof count !== 'number' || typeof total !== 'number' || total === 0) return false;
      return (count / total) * 100 > 5;
    },
    generate: (data) => {
      const count = data['exceptionCount'] as number;
      const total = data['totalProcessed'] as number;
      const percent = ((count / total) * 100).toFixed(1);
      return {
        category: 'warning',
        title: 'High Payroll Exceptions',
        description: `${count} payroll exceptions (${percent}% of total). Review and resolve before next processing cycle.`,
        actionable: true,
        drilldownType: 'payroll-exceptions',
      };
    },
  },
  {
    id: 'payroll-loan-concentration',
    evaluate: (data) => {
      const percent = data['loanConcentrationPercent'] as number | undefined;
      return typeof percent === 'number' && percent > 30;
    },
    generate: (data) => ({
      category: 'info',
      title: 'High Loan Concentration',
      description: `${(data['loanConcentrationPercent'] as number).toFixed(1)}% of employees have active loans. Monitor financial wellness programs.`,
      actionable: false,
      drilldownType: 'payroll-loans',
    }),
  },
];
