interface ManagerEffectivenessInput {
  /** Team average performance rating (0-5 scale) */
  teamAvgRating: number;
  /** Team attrition rate as a percentage (0-100) */
  teamAttritionRate: number;
  /** Average approval delay in days */
  avgApprovalDelayDays: number;
  /** Team attendance percentage (0-100) */
  teamAttendancePercent: number;
  /** Team satisfaction score (0-5 scale) */
  satisfactionScore: number;
}

interface ManagerEffectivenessResult {
  score: number;
  breakdown: { metric: string; weight: number; normalizedValue: number }[];
}

/**
 * Compute manager effectiveness score (0-100).
 *
 * Weights:
 *  - Team avg rating: 30%
 *  - Team attrition inverse: 25%
 *  - Approval delay inverse: 20%
 *  - Team attendance: 15%
 *  - Satisfaction: 10%
 */
export function computeManagerEffectivenessScore(
  input: ManagerEffectivenessInput,
): ManagerEffectivenessResult {
  // Normalize team avg rating (0-5 → 0-100)
  const ratingNorm = Math.min(Math.max((input.teamAvgRating / 5) * 100, 0), 100);

  // Inverse attrition: 0% attrition = 100, 50%+ = 0
  const attritionNorm = Math.min(Math.max(100 - input.teamAttritionRate * 2, 0), 100);

  // Inverse approval delay: 0 days = 100, 10+ days = 0
  const delayNorm = Math.min(Math.max(100 - input.avgApprovalDelayDays * 10, 0), 100);

  // Attendance already 0-100
  const attendanceNorm = Math.min(Math.max(input.teamAttendancePercent, 0), 100);

  // Satisfaction (0-5 → 0-100)
  const satisfactionNorm = Math.min(Math.max((input.satisfactionScore / 5) * 100, 0), 100);

  const breakdown = [
    { metric: 'Team avg rating', weight: 0.30, normalizedValue: ratingNorm },
    { metric: 'Team attrition (inverse)', weight: 0.25, normalizedValue: attritionNorm },
    { metric: 'Approval delay (inverse)', weight: 0.20, normalizedValue: delayNorm },
    { metric: 'Team attendance', weight: 0.15, normalizedValue: attendanceNorm },
    { metric: 'Satisfaction', weight: 0.10, normalizedValue: satisfactionNorm },
  ];

  const score = breakdown.reduce((sum, b) => sum + b.normalizedValue * b.weight, 0);

  return {
    score: Math.round(Math.min(Math.max(score, 0), 100) * 100) / 100,
    breakdown,
  };
}
