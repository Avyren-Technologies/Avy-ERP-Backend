import type { InsightRule } from '../../analytics.types';

export const recruitmentRules: InsightRule[] = [
  {
    id: 'recruitment-aging-positions',
    evaluate: (data) => {
      const count = data['agingPositions'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Aging Open Positions',
      description: `${data['agingPositions'] as number} position(s) have been open for over 60 days. Review sourcing strategy.`,
      actionable: true,
      drilldownType: 'recruitment-aging',
    }),
  },
  {
    id: 'recruitment-funnel-bottleneck',
    evaluate: (data) => {
      const dropoffPercent = data['funnelBottleneckDropoff'] as number | undefined;
      return typeof dropoffPercent === 'number' && dropoffPercent > 50;
    },
    generate: (data) => {
      const stage = (data['bottleneckStage'] as string) || 'unknown stage';
      return {
        category: 'warning',
        title: 'Recruitment Funnel Bottleneck',
        description: `${(data['funnelBottleneckDropoff'] as number).toFixed(0)}% candidate drop-off at ${stage}. Optimize this stage to improve conversion.`,
        actionable: true,
        drilldownType: 'recruitment-funnel',
      };
    },
  },
  {
    id: 'recruitment-low-offer-acceptance',
    evaluate: (data) => {
      const rate = data['offerAcceptanceRate'] as number | undefined;
      return typeof rate === 'number' && rate < 70;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Low Offer Acceptance Rate',
      description: `Offer acceptance rate is ${(data['offerAcceptanceRate'] as number).toFixed(1)}%. Review compensation competitiveness and candidate experience.`,
      actionable: true,
      drilldownType: 'recruitment-offers',
    }),
  },
];
