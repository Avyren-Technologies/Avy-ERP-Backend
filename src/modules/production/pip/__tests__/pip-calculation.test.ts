import {
  calculateIncentive,
  calculateMethod1,
  calculateMethod2,
  calculateSlabAmount,
  PartEntry,
  SlabTier,
} from '../pip-calculation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<PartEntry> & {
    partNumber: string;
    qtyProduced: number;
    shiftTargetQty: number;
    slabTiers: SlabTier[];
  },
): PartEntry {
  return {
    partId: overrides.partNumber,
    partName: overrides.partNumber,
    machineId: 'MC-01',
    machineCode: 'MC-01',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PRD slab configurations
// ---------------------------------------------------------------------------

const SLAB_P101: SlabTier[] = [
  { fromQty: 61, toQty: 70, ratePerPiece: 1 },
  { fromQty: 71, toQty: 80, ratePerPiece: 2 },
  { fromQty: 81, toQty: 90, ratePerPiece: 3 },
  { fromQty: 91, toQty: 100, ratePerPiece: 4 },
  { fromQty: 101, toQty: null, ratePerPiece: 5 },
];

const SLAB_P102: SlabTier[] = [
  { fromQty: 81, toQty: 90, ratePerPiece: 1.5 },
  { fromQty: 91, toQty: 105, ratePerPiece: 3 },
  { fromQty: 106, toQty: 120, ratePerPiece: 4.5 },
  { fromQty: 141, toQty: null, ratePerPiece: 8 },
];

const SLAB_P103: SlabTier[] = [
  { fromQty: 41, toQty: 48, ratePerPiece: 2 },
  { fromQty: 49, toQty: 56, ratePerPiece: 4 },
  { fromQty: 57, toQty: 64, ratePerPiece: 6 },
  { fromQty: 73, toQty: null, ratePerPiece: 10 },
];

const SLAB_P104: SlabTier[] = [
  { fromQty: 121, toQty: 135, ratePerPiece: 0.5 },
  { fromQty: 136, toQty: 150, ratePerPiece: 1 },
  { fromQty: 181, toQty: null, ratePerPiece: 3 },
];

const SLAB_P105: SlabTier[] = [
  { fromQty: 51, toQty: 60, ratePerPiece: 2.5 },
  { fromQty: 61, toQty: 70, ratePerPiece: 5 },
  { fromQty: 71, toQty: 80, ratePerPiece: 7.5 },
  { fromQty: 91, toQty: null, ratePerPiece: 13 },
];

// ===================================================================
// 1. calculateIncentive — dispatch
// ===================================================================

describe('calculateIncentive — dispatch', () => {
  it('dispatches to Method 1 for methodNumber=1', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 90, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const result = calculateIncentive(entries, 1, 'My Method 1');
    expect(result.methodNumber).toBe(1);
    expect(result.methodUsed).toBe('My Method 1');
    // Should match calculateMethod1 output
    const direct = calculateMethod1(entries, 'My Method 1');
    expect(result).toEqual(direct);
  });

  it('dispatches to Method 2 for methodNumber=2', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 90, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const result = calculateIncentive(entries, 2, 'My Method 2');
    expect(result.methodNumber).toBe(2);
    expect(result.methodUsed).toBe('My Method 2');
    const direct = calculateMethod2(entries, 'My Method 2');
    expect(result).toEqual(direct);
  });

  it('returns zero result for empty entries', () => {
    const result = calculateIncentive([], 1);
    expect(result.totalIncentive).toBe(0);
    expect(result.cumulativeRatio).toBe(0);
    expect(result.isEligible).toBe(false);
    expect(result.parts).toHaveLength(0);
    expect(result.methodNumber).toBe(1);
  });

  it('returns correct methodUsed default for Method 1', () => {
    const result = calculateIncentive([], 1);
    expect(result.methodUsed).toBe('');
  });

  it('returns correct methodUsed default for Method 2', () => {
    const result = calculateIncentive([], 2);
    expect(result.methodUsed).toBe('');
  });
});

// ===================================================================
// 2. Method 1 — Excess Ratio Incentive
// ===================================================================

describe('Method 1 — Excess Ratio Incentive', () => {
  // -----------------------------------------------------------------
  // PRD Worked Example
  // -----------------------------------------------------------------
  describe('PRD Worked Example: P-102:40/80 + P-104:70/120', () => {
    it('produces total incentive of 5.00', () => {
      const entries = [
        makeEntry({ partNumber: 'P-102', qtyProduced: 40, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
        makeEntry({ partNumber: 'P-104', qtyProduced: 70, shiftTargetQty: 120, slabTiers: SLAB_P104 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.totalIncentive).toBe(5);

      // P-102: Case A (50%, below 100%)
      expect(result.parts[0].case).toBe('A');
      expect(result.parts[0].earningQty).toBe(0);
      expect(result.parts[0].incentiveAmount).toBe(0);
      expect(result.parts[0].achievementPct).toBe(50);

      // P-104: Case C (crosses 100%)
      expect(result.parts[1].case).toBe('C');
      expect(result.parts[1].earningQty).toBe(10);
      expect(result.parts[1].incentiveAmount).toBe(5);
    });
  });

  // -----------------------------------------------------------------
  // PRD 5 Sample Scenarios
  // -----------------------------------------------------------------
  describe('PRD Sample Scenarios', () => {
    it('Case 1: P-101:30 + P-103:20 → cumul=100% exactly, eligible but 0', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 30, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-103', qtyProduced: 20, shiftTargetQty: 40, slabTiers: SLAB_P103 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(100);
      expect(result.totalIncentive).toBe(0);

      expect(result.parts[0].case).toBe('A');
      expect(result.parts[1].case).toBe('C');
      expect(result.parts[1].earningQty).toBe(0);
    });

    it('Case 3: P-102:110 → cumul=137.5%, eligible, computes slab amount', () => {
      const entries = [
        makeEntry({ partNumber: 'P-102', qtyProduced: 110, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(137.5);
      expect(result.parts[0].case).toBe('C');
      expect(result.parts[0].earningQty).toBe(30);
      // 10 pcs @ 1.50 = 15, 15 pcs @ 3 = 45, 5 pcs @ 4.50 = 22.50 → total 82.50
      expect(result.totalIncentive).toBe(82.5);
    });

    it('Case 5: P-105:75 + P-101:72 → cumul=270%, eligible, high incentive', () => {
      const entries = [
        makeEntry({ partNumber: 'P-105', qtyProduced: 75, shiftTargetQty: 50, slabTiers: SLAB_P105 }),
        makeEntry({ partNumber: 'P-101', qtyProduced: 72, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(270);

      // P-105: Case C, earningQty = 75-50 = 25
      expect(result.parts[0].case).toBe('C');
      expect(result.parts[0].earningQty).toBe(25);
      // 10 @ 2.50=25, 10 @ 5=50, 5 @ 7.50=37.50 → 112.50
      expect(result.parts[0].incentiveAmount).toBe(112.5);

      // P-101: Case B, all 72 earn
      expect(result.parts[1].case).toBe('B');
      expect(result.parts[1].earningQty).toBe(72);
      // belowTarget=60 @ slab1=1 → 60; aboveTarget=12: 10 @ 1=10, 2 @ 2=4 → 74
      expect(result.parts[1].incentiveAmount).toBe(74);

      expect(result.totalIncentive).toBe(186.5);
    });
  });

  // -----------------------------------------------------------------
  // Edge Cases
  // -----------------------------------------------------------------
  describe('Edge Cases', () => {
    it('single part exactly at target (100%): eligible, 0 incentive', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 60, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(100);
      expect(result.parts[0].case).toBe('C');
      expect(result.parts[0].earningQty).toBe(0);
      expect(result.totalIncentive).toBe(0);
    });

    it('single part below target: not eligible', () => {
      const entries = [
        makeEntry({ partNumber: 'P-102', qtyProduced: 40, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(false);
      expect(result.cumulativeRatio).toBe(50);
      expect(result.parts[0].case).toBe('A');
      expect(result.totalIncentive).toBe(0);
    });

    it('single part well above target (200%+): eligible, high incentive', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 130, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.parts[0].case).toBe('C');
      // earningQty = 130-60 = 70, all above target
      expect(result.parts[0].earningQty).toBe(70);
      // 10@1=10 + 10@2=20 + 10@3=30 + 10@4=40 + 30@5=150 = 250
      expect(result.parts[0].incentiveAmount).toBe(250);
      expect(result.totalIncentive).toBe(250);
    });

    it('all zero quantities: not eligible', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 0, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-102', qtyProduced: 0, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(false);
      expect(result.totalIncentive).toBe(0);
    });

    it('single part with empty slab tiers: eligible if >= 100%, but 0 incentive', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 100, shiftTargetQty: 60, slabTiers: [] }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      expect(result.parts[0].earningQty).toBe(40);
      expect(result.parts[0].incentiveAmount).toBe(0);
      expect(result.totalIncentive).toBe(0);
    });

    it('very large quantities (10000 pieces): handles without overflow', () => {
      const slabs: SlabTier[] = [
        { fromQty: 61, toQty: null, ratePerPiece: 0.5 },
      ];
      const entries = [
        makeEntry({ partNumber: 'P-BIG', qtyProduced: 10000, shiftTargetQty: 60, slabTiers: slabs }),
      ];
      const result = calculateMethod1(entries);

      expect(result.isEligible).toBe(true);
      // earningQty = 10000-60 = 9940, all above target at 0.50
      expect(result.parts[0].earningQty).toBe(9940);
      expect(result.parts[0].incentiveAmount).toBe(4970);
      expect(result.totalIncentive).toBe(4970);
    });

    it('multiple parts where cumulative crosses exactly at 1.0: eligible, earningQty=0', () => {
      const entries = [
        makeEntry({ partNumber: 'P-A', qtyProduced: 30, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-B', qtyProduced: 40, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod1(entries);

      // 30/60 + 40/80 = 0.5 + 0.5 = 1.0
      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(100);
      expect(result.totalIncentive).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // Case Classification Tests
  // -----------------------------------------------------------------
  describe('Case Classification', () => {
    it('Case A: part does not push cumulative to 100%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 20, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
      ];
      const result = calculateMethod1(entries);

      expect(result.parts[0].case).toBe('A');
      expect(result.parts[0].earningQty).toBe(0);
      expect(result.parts[0].incentiveAmount).toBe(0);
      expect(result.parts[0].cumulativeRatioAfter).toBe(33.33);
    });

    it('Case B: cumulative already >= 100% before this part', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 90, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-102', qtyProduced: 100, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod1(entries);

      // P-101: 90/60 = 1.5 → Case C (crosses from 0)
      expect(result.parts[0].case).toBe('C');
      // P-102: already at 150% → Case B
      expect(result.parts[1].case).toBe('B');
      expect(result.parts[1].earningQty).toBe(100);
    });

    it('Case C: this part crosses 100%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 30, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-103', qtyProduced: 30, shiftTargetQty: 40, slabTiers: SLAB_P103 }),
      ];
      const result = calculateMethod1(entries);

      // P-101: 30/60 = 0.5 → Case A
      expect(result.parts[0].case).toBe('A');
      // P-103: before=0.5, ratio=0.75, after=1.25 → Case C
      expect(result.parts[1].case).toBe('C');
      expect(result.parts[1].cumulativeRatioBefore).toBe(50);
      expect(result.parts[1].cumulativeRatioAfter).toBe(125);
    });
  });
});

// ===================================================================
// 3. Method 2 — Milestone Rounding Incentive
// ===================================================================

describe('Method 2 — Milestone Rounding Incentive', () => {
  // -----------------------------------------------------------------
  // PRD Worked Example
  // -----------------------------------------------------------------
  describe('PRD Worked Example: P-101:18/60, P-103:25/40, P-102:25/80', () => {
    it('produces total incentive of 20.50', () => {
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 18, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
        makeEntry({ partNumber: 'P-103', qtyProduced: 25, shiftTargetQty: 40, slabTiers: SLAB_P103 }),
        makeEntry({ partNumber: 'P-102', qtyProduced: 25, shiftTargetQty: 80, slabTiers: SLAB_P102 }),
      ];
      const result = calculateMethod2(entries);

      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(100); // milestones: 25+50+25
      expect(result.methodNumber).toBe(2);

      // P-101: 30% → milestone 25%, milestoneQty=15, earningQty=3, 3*1=3
      expect(result.parts[0].milestone).toBe(25);
      expect(result.parts[0].milestoneQty).toBe(15);
      expect(result.parts[0].earningQty).toBe(3);
      expect(result.parts[0].incentiveAmount).toBe(3);

      // P-103: 62.5% → milestone 50%, milestoneQty=20, earningQty=5, 5*2=10
      expect(result.parts[1].milestone).toBe(50);
      expect(result.parts[1].milestoneQty).toBe(20);
      expect(result.parts[1].earningQty).toBe(5);
      expect(result.parts[1].incentiveAmount).toBe(10);

      // P-102: 31.25% → milestone 25%, milestoneQty=20, earningQty=5, 5*1.50=7.50
      expect(result.parts[2].milestone).toBe(25);
      expect(result.parts[2].milestoneQty).toBe(20);
      expect(result.parts[2].earningQty).toBe(5);
      expect(result.parts[2].incentiveAmount).toBe(7.5);

      expect(result.totalIncentive).toBe(20.5);
    });
  });

  // -----------------------------------------------------------------
  // Milestone rounding tests
  // -----------------------------------------------------------------
  describe('Milestone rounding', () => {
    const slabs: SlabTier[] = [{ fromQty: 101, toQty: null, ratePerPiece: 1 }];

    it('0-24% → milestone 0%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 20, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(0);
    });

    it('25-49% → milestone 25%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(25);
    });

    it('50-74% → milestone 50%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 60, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(50);
    });

    it('75-99% → milestone 75%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 80, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(75);
    });

    it('100%+ → milestone 100%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 120, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(100);
    });

    it('exactly at 25.0% boundary → milestone 25%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 25, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(25);
    });

    it('exactly at 50.0% boundary → milestone 50%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 50, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(50);
    });

    it('exactly at 75.0% boundary → milestone 75%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 75, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(75);
    });

    it('exactly at 100.0% boundary → milestone 100%', () => {
      const entries = [
        makeEntry({ partNumber: 'P-X', qtyProduced: 100, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.parts[0].milestone).toBe(100);
    });
  });

  // -----------------------------------------------------------------
  // Eligibility
  // -----------------------------------------------------------------
  describe('Eligibility', () => {
    it('milestones sum to exactly 100%: eligible', () => {
      // 4 parts each at 25% milestone
      const slabs: SlabTier[] = [{ fromQty: 101, toQty: null, ratePerPiece: 1 }];
      const entries = [
        makeEntry({ partNumber: 'A', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
        makeEntry({ partNumber: 'B', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
        makeEntry({ partNumber: 'C', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
        makeEntry({ partNumber: 'D', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      const result = calculateMethod2(entries);
      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(100);
    });

    it('milestones sum to 99%: NOT eligible, all earnings zeroed', () => {
      // 3 parts at 25% + 1 part below 25% (milestone 0) → 75
      const slabs: SlabTier[] = [{ fromQty: 101, toQty: null, ratePerPiece: 1 }];
      const entries = [
        makeEntry({ partNumber: 'A', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
        makeEntry({ partNumber: 'B', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
        makeEntry({ partNumber: 'C', qtyProduced: 30, shiftTargetQty: 100, slabTiers: slabs }),
      ];
      // milestones: 25+25+25 = 75 < 100
      const result = calculateMethod2(entries);
      expect(result.isEligible).toBe(false);
      expect(result.totalIncentive).toBe(0);
      // All part incentives should be zeroed
      result.parts.forEach(p => {
        expect(p.incentiveAmount).toBe(0);
      });
    });

    it('milestones sum to 125%: eligible', () => {
      const slabs: SlabTier[] = [{ fromQty: 101, toQty: null, ratePerPiece: 1 }];
      const entries = [
        makeEntry({ partNumber: 'A', qtyProduced: 55, shiftTargetQty: 100, slabTiers: slabs }), // 50%
        makeEntry({ partNumber: 'B', qtyProduced: 80, shiftTargetQty: 100, slabTiers: slabs }), // 75%
      ];
      const result = calculateMethod2(entries);
      expect(result.isEligible).toBe(true);
      expect(result.cumulativeRatio).toBe(125);
    });
  });

  // -----------------------------------------------------------------
  // Method 2 uses Slab 1 rate only
  // -----------------------------------------------------------------
  describe('Uses Slab 1 rate only', () => {
    it('earning qty uses only first tier rate, not slab-walk', () => {
      // P-101: 90/60 = 150% → milestone 100%, milestoneQty=60, earningQty=30
      // Should use slab1 rate (1) for all 30 pcs, NOT walk through tiers
      const entries = [
        makeEntry({ partNumber: 'P-101', qtyProduced: 90, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
      ];
      const result = calculateMethod2(entries);

      expect(result.parts[0].milestone).toBe(100);
      expect(result.parts[0].milestoneQty).toBe(60);
      expect(result.parts[0].earningQty).toBe(30);
      // 30 * slab1rate(1) = 30 (NOT slab-walked: 10@1+10@2+10@3=60)
      expect(result.parts[0].incentiveAmount).toBe(30);
    });
  });
});

// ===================================================================
// 4. Comparison between methods
// ===================================================================

describe('Comparison between methods', () => {
  it('same input produces different results for Method 1 vs Method 2', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 90, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const r1 = calculateMethod1(entries);
    const r2 = calculateMethod2(entries);

    expect(r1.methodNumber).toBe(1);
    expect(r2.methodNumber).toBe(2);
    // Both should be eligible (90/60 = 150% >= 100%)
    expect(r1.isEligible).toBe(true);
    expect(r2.isEligible).toBe(true);
    // But different incentive amounts
    expect(r1.totalIncentive).not.toBe(r2.totalIncentive);
  });

  it('both agree on eligibility threshold (cumulative >= 100%)', () => {
    // Below threshold
    const belowEntries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 20, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const r1Below = calculateMethod1(belowEntries);
    const r2Below = calculateMethod2(belowEntries);
    expect(r1Below.isEligible).toBe(false);
    expect(r2Below.isEligible).toBe(false);

    // Above threshold with enough milestone contribution
    const aboveEntries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 120, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const r1Above = calculateMethod1(aboveEntries);
    const r2Above = calculateMethod2(aboveEntries);
    expect(r1Above.isEligible).toBe(true);
    expect(r2Above.isEligible).toBe(true);
  });
});

// ===================================================================
// 5. Edge Cases & Robustness
// ===================================================================

describe('Edge Cases & Robustness', () => {
  it('zero shift target: avoids division by zero', () => {
    const entries = [
      makeEntry({ partNumber: 'P-X', qtyProduced: 50, shiftTargetQty: 0, slabTiers: SLAB_P101 }),
    ];
    // Method 1
    const r1 = calculateMethod1(entries);
    expect(r1.isEligible).toBe(false);
    expect(r1.parts[0].achievementPct).toBe(0);

    // Method 2
    const r2 = calculateMethod2(entries);
    expect(r2.parts[0].milestone).toBe(0);
    expect(r2.parts[0].achievementPct).toBe(0);
  });

  it('negative quantity: treats as 0 effectively', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: -5, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const r1 = calculateMethod1(entries);
    expect(r1.isEligible).toBe(false);
    expect(r1.totalIncentive).toBe(0);

    const r2 = calculateMethod2(entries);
    expect(r2.totalIncentive).toBe(0);
  });

  it('part with no slab tiers: returns 0 incentive', () => {
    const entries = [
      makeEntry({ partNumber: 'P-X', qtyProduced: 100, shiftTargetQty: 50, slabTiers: [] }),
    ];
    const r1 = calculateMethod1(entries);
    expect(r1.isEligible).toBe(true);
    expect(r1.totalIncentive).toBe(0);

    const r2 = calculateMethod2(entries);
    // No slab tiers → slab1Rate = 0
    expect(r2.parts[0].incentiveAmount).toBe(0);
  });

  it('single entry array', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 70, shiftTargetQty: 60, slabTiers: SLAB_P101 }),
    ];
    const result = calculateMethod1(entries);

    expect(result.isEligible).toBe(true);
    expect(result.parts).toHaveLength(1);
    // earningQty = 70-60 = 10, all above target in tier 61-70 @ 1 = 10
    expect(result.parts[0].earningQty).toBe(10);
    expect(result.parts[0].incentiveAmount).toBe(10);
  });

  it('10+ entries array', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      makeEntry({
        partNumber: `P-${i + 1}`,
        qtyProduced: 10,
        shiftTargetQty: 60,
        slabTiers: SLAB_P101,
        machineId: `MC-${i + 1}`,
        machineCode: `MC-${i + 1}`,
      }),
    );
    const result = calculateMethod1(entries);
    expect(result.parts).toHaveLength(12);
    // 12 * (10/60) = 2.0 → eligible
    expect(result.isEligible).toBe(true);
    expect(result.cumulativeRatio).toBe(200);
  });

  it('all entries with same part (multiple machines)', () => {
    const entries = [
      makeEntry({ partNumber: 'P-101', qtyProduced: 40, shiftTargetQty: 60, slabTiers: SLAB_P101, machineId: 'MC-01', machineCode: 'MC-01' }),
      makeEntry({ partNumber: 'P-101', qtyProduced: 40, shiftTargetQty: 60, slabTiers: SLAB_P101, machineId: 'MC-02', machineCode: 'MC-02' }),
    ];
    const result = calculateMethod1(entries);

    // 40/60 + 40/60 = 0.667 + 0.667 = 1.333 → eligible
    expect(result.isEligible).toBe(true);
    expect(result.parts).toHaveLength(2);
  });

  it('decimal rounding precision: results are 2 decimal places', () => {
    // Use slabs that produce non-round numbers
    const slabs: SlabTier[] = [
      { fromQty: 61, toQty: 70, ratePerPiece: 1.33 },
      { fromQty: 71, toQty: null, ratePerPiece: 2.67 },
    ];
    const entries = [
      makeEntry({ partNumber: 'P-X', qtyProduced: 75, shiftTargetQty: 60, slabTiers: slabs }),
    ];
    const result = calculateMethod1(entries);

    // earningQty = 15, above target = 15
    // 10 @ 1.33 = 13.30, 5 @ 2.67 = 13.35 → 26.65
    expect(result.totalIncentive).toBe(26.65);
    // Verify it's actually 2 decimal places
    const str = result.totalIncentive.toString();
    const decimalPart = str.split('.')[1] || '';
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });
});

// ===================================================================
// 6. calculateSlabAmount — direct unit tests
// ===================================================================

describe('calculateSlabAmount', () => {
  it('returns 0 for earningQty <= 0', () => {
    const result = calculateSlabAmount(0, 60, 60, SLAB_P101);
    expect(result.amount).toBe(0);
    expect(result.breakdown).toBe('No earning qty');
  });

  it('returns 0 for empty slab tiers', () => {
    const result = calculateSlabAmount(10, 60, 70, []);
    expect(result.amount).toBe(0);
  });

  it('below-target earning uses slab 1 rate', () => {
    // qtyProduced=60 (at target), earningQty=10 → all below target
    const result = calculateSlabAmount(10, 60, 60, SLAB_P101);
    expect(result.amount).toBe(10); // 10 * slab1(1) = 10
  });

  it('above-target earning walks through slab tiers', () => {
    // qtyProduced=80, target=60 → above target=20, earningQty=20
    const result = calculateSlabAmount(20, 60, 80, SLAB_P101);
    // all above target: 10@1 + 10@2 = 30
    expect(result.amount).toBe(30);
  });

  it('mixed below and above target earning', () => {
    // earningQty=70, target=60, qtyProduced=70 → above=10, below=60
    const result = calculateSlabAmount(70, 60, 70, SLAB_P101);
    // below: 60 * 1 = 60, above: 10@1 = 10 → total 70
    expect(result.amount).toBe(70);
  });
});
