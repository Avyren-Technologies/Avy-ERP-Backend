interface AttritionRiskInput {
  performanceBelowAvg: boolean;
  highAbsenteeism: boolean;
  yearsWithoutPromotion: number;
  salaryBelowMedian: boolean;
  tenureInHighAttritionBand: boolean;
  managerHighAttrition: boolean;
}

interface AttritionRiskResult {
  score: number;
  factors: { factor: string; weight: number; triggered: boolean }[];
}

const WEIGHTS = {
  performanceBelowAvg: 25,
  highAbsenteeism: 20,
  noPromotion3Plus: 20,
  salaryBelowMedian: 15,
  tenureHighAttrition: 10,
  managerHighAttrition: 10,
} as const;

/**
 * Compute an attrition risk score (0-100) with contributing factors.
 */
export function computeAttritionRiskScore(input: AttritionRiskInput): AttritionRiskResult {
  const factors = [
    {
      factor: 'Performance below average',
      weight: WEIGHTS.performanceBelowAvg,
      triggered: input.performanceBelowAvg,
    },
    {
      factor: 'High absenteeism',
      weight: WEIGHTS.highAbsenteeism,
      triggered: input.highAbsenteeism,
    },
    {
      factor: 'No promotion in 3+ years',
      weight: WEIGHTS.noPromotion3Plus,
      triggered: input.yearsWithoutPromotion >= 3,
    },
    {
      factor: 'Salary below median',
      weight: WEIGHTS.salaryBelowMedian,
      triggered: input.salaryBelowMedian,
    },
    {
      factor: 'Tenure in high-attrition band',
      weight: WEIGHTS.tenureHighAttrition,
      triggered: input.tenureInHighAttritionBand,
    },
    {
      factor: 'Manager with high attrition',
      weight: WEIGHTS.managerHighAttrition,
      triggered: input.managerHighAttrition,
    },
  ];

  const score = factors.reduce((sum, f) => sum + (f.triggered ? f.weight : 0), 0);

  return { score: Math.min(score, 100), factors };
}
