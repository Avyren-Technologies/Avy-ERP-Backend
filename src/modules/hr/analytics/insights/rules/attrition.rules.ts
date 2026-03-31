import type { InsightRule } from '@/modules/hr/analytics/analytics.types';

export const attritionRules: InsightRule[] = [
  {
    id: 'attrition-high-rate',
    evaluate: (data) => {
      const rate = data['attritionRate'] as number | undefined;
      return typeof rate === 'number' && rate > 20;
    },
    generate: (data) => ({
      category: 'critical',
      title: 'High Attrition Rate',
      description: `Attrition rate is ${(data['attritionRate'] as number).toFixed(1)}%, exceeding the 20% threshold. Immediate intervention recommended.`,
      actionable: true,
      drilldownType: 'attrition-exits',
    }),
  },
  {
    id: 'attrition-early-exits',
    evaluate: (data) => {
      const rate = data['earlyAttritionRate'] as number | undefined;
      return typeof rate === 'number' && rate > 30;
    },
    generate: (data) => ({
      category: 'critical',
      title: 'High Early Attrition',
      description: `${(data['earlyAttritionRate'] as number).toFixed(1)}% of exits are within the first year. Review onboarding process and hiring fit.`,
      actionable: true,
      drilldownType: 'attrition-early-exits',
    }),
  },
  {
    id: 'attrition-high-performers',
    evaluate: (data) => {
      const count = data['highPerformerExits'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'High-Performer Exits',
      description: `${data['highPerformerExits'] as number} high-performing employees have exited. Conduct stay interviews with remaining top talent.`,
      actionable: true,
      drilldownType: 'attrition-high-performer-exits',
    }),
  },
  {
    id: 'attrition-fnf-delay',
    evaluate: (data) => {
      const avgDays = data['avgFnfDays'] as number | undefined;
      return typeof avgDays === 'number' && avgDays > 30;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'F&F Settlement Delay',
      description: `Average full & final settlement takes ${Math.round(data['avgFnfDays'] as number)} days, exceeding the 30-day target.`,
      actionable: true,
      drilldownType: 'attrition-fnf-pending',
    }),
  },
];
