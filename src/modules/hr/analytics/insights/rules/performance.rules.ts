import type { InsightRule } from '../../analytics.types';

export const performanceRules: InsightRule[] = [
  {
    id: 'performance-bell-curve-skew',
    evaluate: (data) => {
      const skew = data['bellCurveSkew'] as number | undefined;
      return typeof skew === 'number' && Math.abs(skew) > 0.5;
    },
    generate: (data) => {
      const skew = data['bellCurveSkew'] as number;
      const direction = skew > 0 ? 'positively (inflated ratings)' : 'negatively (compressed ratings)';
      return {
        category: 'warning',
        title: 'Bell Curve Distribution Skew',
        description: `Performance ratings are skewed ${direction}. Consider calibration sessions to normalize distribution.`,
        actionable: true,
        drilldownType: 'performance-distribution',
      };
    },
  },
  {
    id: 'performance-low-completion',
    evaluate: (data) => {
      const percent = data['appraisalCompletionPercent'] as number | undefined;
      return typeof percent === 'number' && percent < 80;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Low Appraisal Completion',
      description: `Only ${(data['appraisalCompletionPercent'] as number).toFixed(1)}% of appraisals are complete. Send reminders to pending reviewers.`,
      actionable: true,
      drilldownType: 'performance-pending',
    }),
  },
  {
    id: 'performance-critical-no-successor',
    evaluate: (data) => {
      const count = data['criticalRolesWithoutSuccessor'] as number | undefined;
      return typeof count === 'number' && count > 0;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Critical Roles Without Successors',
      description: `${data['criticalRolesWithoutSuccessor'] as number} critical role(s) lack identified successors. Initiate succession planning.`,
      actionable: true,
      drilldownType: 'performance-succession',
    }),
  },
];
