/**
 * PIP Calculation Engine — Pure Functions
 *
 * Implements the two incentive calculation methods defined in the PIP PRD (Section 8).
 * This module has ZERO side effects — no database, no I/O, no external imports.
 * Safe to use on both backend and frontend (client-side simulation).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlabTier {
  fromQty: number;
  toQty: number | null; // null = unlimited (infinite)
  ratePerPiece: number;
}

export interface PartEntry {
  partId: string;
  partNumber: string;
  partName: string;
  machineId: string;
  machineCode: string;
  qtyProduced: number;
  shiftTargetQty: number;
  slabTiers: SlabTier[];
}

export interface PartResult {
  partId: string;
  partNumber: string;
  partName: string;
  machineId: string;
  machineCode: string;
  qtyProduced: number;
  shiftTargetQty: number;
  achievementPct: number; // qtyProduced / shiftTargetQty * 100
  cumulativeRatioBefore: number; // cumulative ratio BEFORE this part
  cumulativeRatioAfter: number; // cumulative ratio AFTER this part
  case: 'A' | 'B' | 'C' | 'N/A'; // Method 1 case classification
  milestone?: number; // Method 2: milestone percentage (0, 25, 50, 75, 100)
  milestoneQty?: number; // Method 2: milestone qty
  earningQty: number;
  incentiveAmount: number;
  breakdown: string; // Human-readable detail
  consideredPct: number;    // Method 2: milestone%. Method 1: 100% if eligible, 0% if not
  appliedRate: number;      // Rate per piece from the primary slab tier
  appliedSlabLabel: string; // "Slab 1", "Slab 2", etc.
}

export interface CalculationResult {
  totalIncentive: number;
  cumulativeRatio: number;
  isEligible: boolean;
  methodUsed: string;
  methodNumber: 1 | 2;
  parts: PartResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate incentive amount for a given earning quantity using slab tiers.
 *
 * The earning quantity is split into two segments:
 *   1. Below-target portion — qty still within the part's shift target -> Slab 1 rate
 *   2. Above-target portion — qty exceeding the shift target -> walk through slab tiers
 *
 * @param earningQty   The number of pieces that earn incentive
 * @param shiftTargetQty The individual part's shift target
 * @param qtyProduced  Total qty produced for this part (needed to determine where above-target starts)
 * @param slabTiers    The slab tier configuration for this part
 * @returns { amount, breakdown } — the incentive amount and a human-readable breakdown string
 */
export function calculateSlabAmount(
  earningQty: number,
  shiftTargetQty: number,
  qtyProduced: number,
  slabTiers: SlabTier[],
): { amount: number; breakdown: string } {
  if (earningQty <= 0 || slabTiers.length === 0) {
    return { amount: 0, breakdown: 'No earning qty' };
  }

  const slab1Rate = slabTiers[0]!.ratePerPiece;

  // Determine how much of the earning qty is below-target vs above-target.
  // The earning qty starts from (qtyProduced - earningQty + 1) conceptually.
  // Above-target portion = max(0, qtyProduced - shiftTargetQty)
  // Below-target portion of earning = earningQty - aboveTargetEarning
  const totalAboveTarget = Math.max(0, qtyProduced - shiftTargetQty);
  const aboveTargetEarning = Math.min(earningQty, totalAboveTarget);
  const belowTargetEarning = earningQty - aboveTargetEarning;

  let amount = 0;
  const breakdownParts: string[] = [];

  // Below-target portion earns at Slab 1 rate
  if (belowTargetEarning > 0) {
    const segmentAmount = round2(belowTargetEarning * slab1Rate);
    amount += segmentAmount;
    breakdownParts.push(`${belowTargetEarning} pcs within target @ ₹${slab1Rate} = ₹${segmentAmount}`);
  }

  // Above-target portion walks through slab tiers
  if (aboveTargetEarning > 0) {
    let remaining = aboveTargetEarning;
    // We need to figure out which tier(s) the above-target pieces fall into.
    // Above-target pieces start from (shiftTargetQty + 1) up to qtyProduced.
    // But we only earn on the last `aboveTargetEarning` of those.
    // Start position for earning above target = qtyProduced - aboveTargetEarning + 1
    // However, for slab tier assignment, the position is relative to production qty.
    // Tier fromQty/toQty are absolute qty values (e.g., 61-70 for a target of 60).
    // We walk tiers from lowest, skipping pieces that were not part of earning.

    // Pieces above target that DON'T earn (consumed reaching 100% cumulative)
    const nonEarningAboveTarget = totalAboveTarget - aboveTargetEarning;
    let skipped = 0;

    for (const tier of slabTiers) {
      if (remaining <= 0) break;

      const tierFrom = tier.fromQty;
      const tierTo = tier.toQty !== null ? tier.toQty : Infinity;
      const tierCapacity = tierTo === Infinity ? Infinity : tierTo - tierFrom + 1;

      // Skip pieces in this tier that are non-earning above-target pieces
      const skipInTier = Math.min(
        Math.max(0, nonEarningAboveTarget - skipped),
        tierCapacity === Infinity ? Math.max(0, nonEarningAboveTarget - skipped) : tierCapacity,
      );
      skipped += skipInTier;
      const availableInTier =
        tierCapacity === Infinity ? remaining : Math.max(0, tierCapacity - skipInTier);

      const piecesInTier = Math.min(remaining, availableInTier);
      if (piecesInTier > 0) {
        const segmentAmount = round2(piecesInTier * tier.ratePerPiece);
        amount += segmentAmount;
        breakdownParts.push(
          `${piecesInTier} pcs above target [${tierFrom}-${tier.toQty ?? '∞'}] @ ₹${tier.ratePerPiece} = ₹${segmentAmount}`,
        );
        remaining -= piecesInTier;
      }
    }

    // If remaining pieces exist beyond all defined tiers, they earn nothing
    // (no tier covers them — this shouldn't happen with a proper ∞ final tier)
  }

  return { amount: round2(amount), breakdown: breakdownParts.join('; ') };
}

// ---------------------------------------------------------------------------
// Method 1 — Excess Ratio Incentive (PRD Section 8.2)
// ---------------------------------------------------------------------------

/**
 * Method 1: Excess Ratio Incentive
 *
 * Core rule: Cumulative Ratio = Sum of (qtyProduced / shiftTargetQty) per part.
 * Must be >= 1.0 for ANY incentive. Only production that pushes past 100% earns.
 *
 * Process entries IN ORDER, tracking running cumulative ratio.
 * Three cases per part: A (below 100%), B (already past), C (crosses 100%).
 */
export function calculateMethod1(
  entries: PartEntry[],
  methodName?: string,
): CalculationResult {
  let cumulativeRatio = 0;
  const partResults: PartResult[] = [];

  for (const entry of entries) {
    const ratioBefore = cumulativeRatio;
    const partRatio = entry.shiftTargetQty > 0 ? entry.qtyProduced / entry.shiftTargetQty : 0;
    const ratioAfter = ratioBefore + partRatio;
    const achievementPct = round2(
      entry.shiftTargetQty > 0 ? (entry.qtyProduced / entry.shiftTargetQty) * 100 : 0,
    );

    let caseType: 'A' | 'B' | 'C';
    let earningQty = 0;
    let incentiveAmount = 0;
    let breakdown = '';

    let consideredPct: number;
    let appliedRate: number;
    let appliedSlabLabel: string;

    if (ratioAfter <= 1.0) {
      // Case A — At or below 100%: cumulative ratio hasn't strictly exceeded 1.0
      caseType = 'A';
      earningQty = 0;
      incentiveAmount = 0;
      breakdown = `Cumulative ${round2(ratioAfter * 100)}% — below 100%, no incentive`;
      consideredPct = 0;
      appliedRate = 0;
      appliedSlabLabel = 'N/A';
    } else if (ratioBefore > 1.0) {
      // Case B — Already past 100%: only excess above target earns
      caseType = 'B';
      earningQty = Math.max(0, entry.qtyProduced - entry.shiftTargetQty);
      const slabResult = calculateSlabAmount(
        earningQty,
        entry.shiftTargetQty,
        entry.qtyProduced,
        entry.slabTiers,
      );
      incentiveAmount = slabResult.amount;
      breakdown = `${earningQty} excess pcs earn (already past 100%); ${slabResult.breakdown}`;
      consideredPct = 100;
      appliedRate = entry.slabTiers.length > 0 ? entry.slabTiers[0]!.ratePerPiece : 0;
      appliedSlabLabel = entry.slabTiers.length > 0 ? 'Slab 1' : 'N/A';
    } else {
      // Case C — Crosses 100%: part of production consumed reaching threshold
      caseType = 'C';
      const ratioNeeded = 1.0 - ratioBefore;
      const piecesNeeded = Math.round(ratioNeeded * entry.shiftTargetQty);
      earningQty = Math.max(0, entry.qtyProduced - piecesNeeded);

      if (earningQty > 0) {
        const slabResult = calculateSlabAmount(
          earningQty,
          entry.shiftTargetQty,
          entry.qtyProduced,
          entry.slabTiers,
        );
        incentiveAmount = slabResult.amount;
        breakdown = `${piecesNeeded} pcs to reach 100%, ${earningQty} pcs earn; ${slabResult.breakdown}`;
      } else {
        breakdown = `${piecesNeeded} pcs to reach 100%, 0 pcs earn`;
      }
      consideredPct = 100;
      appliedRate = entry.slabTiers.length > 0 ? entry.slabTiers[0]!.ratePerPiece : 0;
      appliedSlabLabel = earningQty > 0 && entry.slabTiers.length > 0 ? 'Slab 1' : 'N/A';
    }

    cumulativeRatio = ratioAfter;

    partResults.push({
      partId: entry.partId,
      partNumber: entry.partNumber,
      partName: entry.partName,
      machineId: entry.machineId,
      machineCode: entry.machineCode,
      qtyProduced: entry.qtyProduced,
      shiftTargetQty: entry.shiftTargetQty,
      achievementPct,
      cumulativeRatioBefore: round2(ratioBefore * 100),
      cumulativeRatioAfter: round2(ratioAfter * 100),
      case: caseType,
      earningQty,
      incentiveAmount: round2(incentiveAmount),
      breakdown,
      consideredPct,
      appliedRate,
      appliedSlabLabel,
    });
  }

  const totalIncentive = round2(partResults.reduce((sum, p) => sum + p.incentiveAmount, 0));
  const isEligible = cumulativeRatio > 1.0;

  return {
    totalIncentive,
    cumulativeRatio: round2(cumulativeRatio * 100),
    isEligible,
    methodUsed: methodName || 'Excess Ratio Incentive',
    methodNumber: 1,
    parts: partResults,
  };
}

// ---------------------------------------------------------------------------
// Method 2 — Milestone Rounding Incentive (PRD Section 8.3)
// ---------------------------------------------------------------------------

/** Available milestones for Method 2 */
const MILESTONES = [0, 25, 50, 75, 100] as const;

/**
 * Floor a percentage to the nearest milestone (0, 25, 50, 75, 100).
 * If actualPct >= 100, milestone is 100.
 */
function floorToMilestone(actualPct: number): number {
  // Walk milestones from highest to lowest, return first one <= actualPct
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (actualPct >= MILESTONES[i]!) {
      return MILESTONES[i]!;
    }
  }
  return 0;
}

/**
 * Method 2: Milestone Rounding Incentive
 *
 * For each part:
 *   1. actualPct = qtyProduced / shiftTargetQty
 *   2. milestone = floor to nearest 25% step (0, 25, 50, 75, 100)
 *   3. milestoneQty = milestone% * shiftTargetQty
 *   4. earningQty = qtyProduced - milestoneQty
 *   5. earningQty earns at Slab 1 rate only
 *
 * Sum of milestone fractions must be >= 100% for eligibility.
 */
export function calculateMethod2(
  entries: PartEntry[],
  methodName?: string,
): CalculationResult {
  const partResults: PartResult[] = [];
  let milestoneSum = 0;

  // First pass: compute milestones and earning quantities
  for (const entry of entries) {
    const actualPct =
      entry.shiftTargetQty > 0 ? (entry.qtyProduced / entry.shiftTargetQty) * 100 : 0;
    const milestone = floorToMilestone(actualPct);
    const milestoneQty = Math.floor((milestone / 100) * entry.shiftTargetQty);
    // Parts below 25% (milestone=0) earn nothing — they contribute no milestone credit
    const earningQty = milestone > 0 ? Math.max(0, entry.qtyProduced - milestoneQty) : 0;
    const slab1Rate = entry.slabTiers.length > 0 ? entry.slabTiers[0]!.ratePerPiece : 0;
    const incentiveAmount = round2(earningQty * slab1Rate);

    milestoneSum += milestone;

    const achievementPct = round2(actualPct);
    const breakdown =
      milestone === 0
        ? `Below 25% — milestone 0%, no contribution, no earning`
        : `${milestone}% milestone, ${milestoneQty} counted, ${earningQty} pcs x ₹${slab1Rate} = ₹${incentiveAmount}`;

    partResults.push({
      partId: entry.partId,
      partNumber: entry.partNumber,
      partName: entry.partName,
      machineId: entry.machineId,
      machineCode: entry.machineCode,
      qtyProduced: entry.qtyProduced,
      shiftTargetQty: entry.shiftTargetQty,
      achievementPct,
      cumulativeRatioBefore: 0, // Not applicable for Method 2 in the same way
      cumulativeRatioAfter: 0,
      case: 'N/A', // Method 2 does not use A/B/C classification
      milestone,
      milestoneQty,
      earningQty,
      incentiveAmount,
      breakdown,
      consideredPct: milestone,
      appliedRate: slab1Rate,
      appliedSlabLabel: slab1Rate > 0 ? 'Slab 1' : 'N/A',
    });
  }

  const isEligible = milestoneSum >= 100;

  // If not eligible, zero out all incentives
  if (!isEligible) {
    for (const part of partResults) {
      part.incentiveAmount = 0;
      part.breakdown = `${part.breakdown} [NOT ELIGIBLE — milestones total ${milestoneSum}%]`;
    }
  }

  const totalIncentive = isEligible
    ? round2(partResults.reduce((sum, p) => sum + p.incentiveAmount, 0))
    : 0;

  return {
    totalIncentive,
    cumulativeRatio: milestoneSum, // For Method 2, this represents milestone sum percentage
    isEligible,
    methodUsed: methodName || 'Milestone Rounding Incentive',
    methodNumber: 2,
    parts: partResults,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Calculate incentive using the specified method.
 *
 * @param entries     Array of part entries for the operator's shift
 * @param methodNumber Which method to use (1 = Excess Ratio, 2 = Milestone Rounding)
 * @param methodName  Optional display name for the method
 */
export function calculateIncentive(
  entries: PartEntry[],
  methodNumber: 1 | 2,
  methodName?: string,
): CalculationResult {
  if (entries.length === 0) {
    return {
      totalIncentive: 0,
      cumulativeRatio: 0,
      isEligible: false,
      methodUsed: methodName || '',
      methodNumber,
      parts: [],
    };
  }

  // Method 1: sort entries ascending by individual ratio (qty/target) so low-completion
  // parts are consumed toward the 100% threshold first, maximising operator earnings.
  // Method 2: order doesn't matter (each part is independent), pass as-is.
  if (methodNumber === 1) {
    const sorted = [...entries].sort((a, b) => {
      const ratioA = a.shiftTargetQty > 0 ? a.qtyProduced / a.shiftTargetQty : 0;
      const ratioB = b.shiftTargetQty > 0 ? b.qtyProduced / b.shiftTargetQty : 0;
      return ratioA - ratioB;
    });
    return calculateMethod1(sorted, methodName);
  }
  return calculateMethod2(entries, methodName);
}
