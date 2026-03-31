interface ComplianceInput {
  /** Filing compliance percentage (0-100) */
  filingCompliancePercent: number;
  /** Minimum wage compliance percentage (0-100) */
  minWageCompliancePercent: number;
  /** Grievance SLA compliance percentage (0-100) */
  grievanceSlaPercent: number;
  /** Document compliance percentage (0-100) */
  documentCompliancePercent: number;
  /** Data retention compliance percentage (0-100) */
  dataRetentionPercent: number;
}

interface ComplianceResult {
  score: number;
  breakdown: { metric: string; weight: number; value: number }[];
}

/**
 * Compute a compliance score (0-100).
 *
 * Weights:
 *  - Filing compliance: 40%
 *  - Min wage: 20%
 *  - Grievance SLA: 15%
 *  - Document compliance: 15%
 *  - Data retention: 10%
 */
export function computeComplianceScore(input: ComplianceInput): ComplianceResult {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 100);

  const breakdown = [
    { metric: 'Filing compliance', weight: 0.40, value: clamp(input.filingCompliancePercent) },
    { metric: 'Min wage compliance', weight: 0.20, value: clamp(input.minWageCompliancePercent) },
    { metric: 'Grievance SLA', weight: 0.15, value: clamp(input.grievanceSlaPercent) },
    { metric: 'Document compliance', weight: 0.15, value: clamp(input.documentCompliancePercent) },
    { metric: 'Data retention', weight: 0.10, value: clamp(input.dataRetentionPercent) },
  ];

  const score = breakdown.reduce((sum, b) => sum + b.value * b.weight, 0);

  return {
    score: Math.round(Math.min(Math.max(score, 0), 100) * 100) / 100,
    breakdown,
  };
}
