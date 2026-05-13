import {
  createSlabConfigSchema,
  bulkCreateSlabConfigSchema,
  updateSlabConfigSchema,
  saveDailyEntriesSchema,
  simulateIncentiveSchema,
  updateIncentiveConfigSchema,
  generateMonthlyReportSchema,
  mergeToPayrollSchema,
  listSlabConfigsSchema,
  listDailyEntriesSchema,
  listMonthlyReportsSchema,
} from '../pip.validators';

// ── Helpers ────────────────────────────────────────────────────────────

const validSlabTier = { fromQty: 61, toQty: 70, ratePerPiece: 1.5 };
const validSlabTierUnlimited = { fromQty: 71, toQty: null, ratePerPiece: 2.0 };

// ── createSlabConfigSchema ─────────────────────────────────────────────

describe('createSlabConfigSchema', () => {
  const validInput = {
    machineId: 'machine-1',
    partId: 'part-1',
    shiftTargetQty: 60,
    slabTiers: [validSlabTier],
  };

  it('should accept valid input with all required fields', () => {
    expect(createSlabConfigSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept valid input with optional locationId', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, locationId: 'loc-1' }).success).toBe(true);
  });

  it('should accept input without optional locationId', () => {
    expect(createSlabConfigSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept multiple slab tiers', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [validSlabTier, validSlabTierUnlimited],
    });
    expect(result.success).toBe(true);
  });

  it('should accept slab tier with null toQty (unlimited)', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [validSlabTierUnlimited],
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing machineId', () => {
    const { machineId, ...rest } = validInput;
    expect(createSlabConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject empty machineId', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, machineId: '' }).success).toBe(false);
  });

  it('should reject missing partId', () => {
    const { partId, ...rest } = validInput;
    expect(createSlabConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject empty partId', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, partId: '' }).success).toBe(false);
  });

  it('should reject negative shiftTargetQty', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, shiftTargetQty: -5 }).success).toBe(false);
  });

  it('should reject zero shiftTargetQty', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, shiftTargetQty: 0 }).success).toBe(false);
  });

  it('should reject non-integer shiftTargetQty', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, shiftTargetQty: 5.5 }).success).toBe(false);
  });

  it('should reject string shiftTargetQty', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, shiftTargetQty: '60' }).success).toBe(false);
  });

  it('should reject empty slabTiers array', () => {
    expect(createSlabConfigSchema.safeParse({ ...validInput, slabTiers: [] }).success).toBe(false);
  });

  it('should reject missing slabTiers', () => {
    const { slabTiers, ...rest } = validInput;
    expect(createSlabConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject slab tier with negative fromQty', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: -1, toQty: 70, ratePerPiece: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject slab tier with negative ratePerPiece', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: 61, toQty: 70, ratePerPiece: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject slab tier with zero ratePerPiece', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: 61, toQty: 70, ratePerPiece: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('should accept slab tier with fromQty of 0', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: 0, toQty: 70, ratePerPiece: 1.5 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject slab tier with non-positive toQty', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: 61, toQty: 0, ratePerPiece: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject slab tier with negative toQty', () => {
    const result = createSlabConfigSchema.safeParse({
      ...validInput,
      slabTiers: [{ fromQty: 61, toQty: -5, ratePerPiece: 1.5 }],
    });
    expect(result.success).toBe(false);
  });
});

// ── bulkCreateSlabConfigSchema ─────────────────────────────────────────

describe('bulkCreateSlabConfigSchema', () => {
  const validInput = {
    machineIds: ['machine-1', 'machine-2'],
    configs: [
      {
        partId: 'part-1',
        shiftTargetQty: 60,
        slabTiers: [validSlabTier],
      },
    ],
  };

  it('should accept valid input', () => {
    expect(bulkCreateSlabConfigSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept with optional locationId', () => {
    expect(bulkCreateSlabConfigSchema.safeParse({ ...validInput, locationId: 'loc-1' }).success).toBe(true);
  });

  it('should accept multiple configs', () => {
    const result = bulkCreateSlabConfigSchema.safeParse({
      ...validInput,
      configs: [
        { partId: 'part-1', shiftTargetQty: 60, slabTiers: [validSlabTier] },
        { partId: 'part-2', shiftTargetQty: 80, slabTiers: [validSlabTierUnlimited] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty machineIds array', () => {
    expect(bulkCreateSlabConfigSchema.safeParse({ ...validInput, machineIds: [] }).success).toBe(false);
  });

  it('should reject empty configs array', () => {
    expect(bulkCreateSlabConfigSchema.safeParse({ ...validInput, configs: [] }).success).toBe(false);
  });

  it('should reject machineIds with empty strings', () => {
    expect(bulkCreateSlabConfigSchema.safeParse({ ...validInput, machineIds: [''] }).success).toBe(false);
  });

  it('should reject missing machineIds', () => {
    const { machineIds, ...rest } = validInput;
    expect(bulkCreateSlabConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing configs', () => {
    const { configs, ...rest } = validInput;
    expect(bulkCreateSlabConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject config with missing partId', () => {
    const result = bulkCreateSlabConfigSchema.safeParse({
      ...validInput,
      configs: [{ shiftTargetQty: 60, slabTiers: [validSlabTier] }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject config with empty slabTiers', () => {
    const result = bulkCreateSlabConfigSchema.safeParse({
      ...validInput,
      configs: [{ partId: 'part-1', shiftTargetQty: 60, slabTiers: [] }],
    });
    expect(result.success).toBe(false);
  });
});

// ── updateSlabConfigSchema ─────────────────────────────────────────────

describe('updateSlabConfigSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    expect(updateSlabConfigSchema.safeParse({}).success).toBe(true);
  });

  it('should accept only shiftTargetQty', () => {
    expect(updateSlabConfigSchema.safeParse({ shiftTargetQty: 100 }).success).toBe(true);
  });

  it('should accept only slabTiers', () => {
    expect(updateSlabConfigSchema.safeParse({ slabTiers: [validSlabTier] }).success).toBe(true);
  });

  it('should accept only isActive', () => {
    expect(updateSlabConfigSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('should accept all fields together', () => {
    const result = updateSlabConfigSchema.safeParse({
      shiftTargetQty: 100,
      slabTiers: [validSlabTier],
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative shiftTargetQty', () => {
    expect(updateSlabConfigSchema.safeParse({ shiftTargetQty: -1 }).success).toBe(false);
  });

  it('should reject zero shiftTargetQty', () => {
    expect(updateSlabConfigSchema.safeParse({ shiftTargetQty: 0 }).success).toBe(false);
  });

  it('should reject empty slabTiers array', () => {
    expect(updateSlabConfigSchema.safeParse({ slabTiers: [] }).success).toBe(false);
  });

  it('should reject non-boolean isActive', () => {
    expect(updateSlabConfigSchema.safeParse({ isActive: 'true' }).success).toBe(false);
  });
});

// ── saveDailyEntriesSchema ─────────────────────────────────────────────

describe('saveDailyEntriesSchema', () => {
  const validEntry = {
    machineId: 'machine-1',
    partId: 'part-1',
    qtyProduced: 75,
  };

  const validInput = {
    entryDate: '2026-05-12',
    shiftId: 'shift-1',
    operatorId: 'operator-1',
    entries: [validEntry],
  };

  it('should accept valid input with required fields only', () => {
    expect(saveDailyEntriesSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept valid input with all optional fields', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      locationId: 'loc-1',
      entries: [{ ...validEntry, slabConfigId: 'slab-1', ncCount: 3, ncReason: 'Defect' }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept qtyProduced of 0', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, qtyProduced: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept ncCount of 0', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, ncCount: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept multiple entries', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [validEntry, { ...validEntry, machineId: 'machine-2' }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format (DD-MM-YYYY)', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, entryDate: '12-05-2026' }).success).toBe(false);
  });

  it('should reject invalid date format (MM/DD/YYYY)', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, entryDate: '05/12/2026' }).success).toBe(false);
  });

  it('should reject invalid date format (ISO datetime)', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, entryDate: '2026-05-12T10:00:00Z' }).success).toBe(false);
  });

  it('should reject empty shiftId', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, shiftId: '' }).success).toBe(false);
  });

  it('should reject missing shiftId', () => {
    const { shiftId, ...rest } = validInput;
    expect(saveDailyEntriesSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject empty operatorId', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, operatorId: '' }).success).toBe(false);
  });

  it('should reject empty entries array', () => {
    expect(saveDailyEntriesSchema.safeParse({ ...validInput, entries: [] }).success).toBe(false);
  });

  it('should reject negative qtyProduced', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, qtyProduced: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer qtyProduced', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, qtyProduced: 5.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative ncCount', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, ncCount: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject entry with empty machineId', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, machineId: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject entry with empty partId', () => {
    const result = saveDailyEntriesSchema.safeParse({
      ...validInput,
      entries: [{ ...validEntry, partId: '' }],
    });
    expect(result.success).toBe(false);
  });
});

// ── simulateIncentiveSchema ────────────────────────────────────────────

describe('simulateIncentiveSchema', () => {
  const validEntry = {
    partId: 'part-1',
    qtyProduced: 75,
    shiftTargetQty: 60,
    slabTiers: [validSlabTier],
  };

  const validInput = { entries: [validEntry] };

  it('should accept valid input with required fields', () => {
    expect(simulateIncentiveSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept input with all optional fields', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{
        ...validEntry,
        partNumber: 'PN-001',
        partName: 'Widget A',
        machineId: 'machine-1',
        machineCode: 'MC-001',
      }],
      methodNumber: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should accept methodNumber 2', () => {
    expect(simulateIncentiveSchema.safeParse({ ...validInput, methodNumber: 2 }).success).toBe(true);
  });

  it('should reject methodNumber 3', () => {
    expect(simulateIncentiveSchema.safeParse({ ...validInput, methodNumber: 3 }).success).toBe(false);
  });

  it('should reject methodNumber 0', () => {
    expect(simulateIncentiveSchema.safeParse({ ...validInput, methodNumber: 0 }).success).toBe(false);
  });

  it('should reject empty entries array', () => {
    expect(simulateIncentiveSchema.safeParse({ entries: [] }).success).toBe(false);
  });

  it('should reject entry with empty partId', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, partId: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject entry with negative qtyProduced', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, qtyProduced: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should accept entry with qtyProduced of 0', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, qtyProduced: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject entry with zero shiftTargetQty', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, shiftTargetQty: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject entry with negative shiftTargetQty', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, shiftTargetQty: -10 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject entry with empty slabTiers', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, slabTiers: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('should accept fractional qtyProduced (no int constraint)', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [{ ...validEntry, qtyProduced: 5.5 }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept multiple entries', () => {
    const result = simulateIncentiveSchema.safeParse({
      entries: [validEntry, { ...validEntry, partId: 'part-2' }],
    });
    expect(result.success).toBe(true);
  });
});

// ── updateIncentiveConfigSchema ────────────────────────────────────────

describe('updateIncentiveConfigSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    expect(updateIncentiveConfigSchema.safeParse({}).success).toBe(true);
  });

  it('should accept only method1Enabled', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method1Enabled: true }).success).toBe(true);
  });

  it('should accept only method1Name', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method1Name: 'Slab Incentive' }).success).toBe(true);
  });

  it('should accept only method2Enabled', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method2Enabled: false }).success).toBe(true);
  });

  it('should accept only method2Name', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method2Name: 'Target Incentive' }).success).toBe(true);
  });

  it('should accept all fields together', () => {
    const result = updateIncentiveConfigSchema.safeParse({
      method1Enabled: true,
      method1Name: 'Method A',
      method2Enabled: false,
      method2Name: 'Method B',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty method1Name', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method1Name: '' }).success).toBe(false);
  });

  it('should reject empty method2Name', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method2Name: '' }).success).toBe(false);
  });

  it('should reject non-boolean method1Enabled', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method1Enabled: 'true' }).success).toBe(false);
  });

  it('should reject non-boolean method2Enabled', () => {
    expect(updateIncentiveConfigSchema.safeParse({ method2Enabled: 1 }).success).toBe(false);
  });
});

// ── generateMonthlyReportSchema ────────────────────────────────────────

describe('generateMonthlyReportSchema', () => {
  const validInput = { month: 6, year: 2026 };

  it('should accept valid input', () => {
    expect(generateMonthlyReportSchema.safeParse(validInput).success).toBe(true);
  });

  it('should accept with optional locationId', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, locationId: 'loc-1' }).success).toBe(true);
  });

  it('should accept month 1 (January)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: 1 }).success).toBe(true);
  });

  it('should accept month 12 (December)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: 12 }).success).toBe(true);
  });

  it('should accept year 2020 (minimum)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, year: 2020 }).success).toBe(true);
  });

  it('should accept year 2099 (maximum)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, year: 2099 }).success).toBe(true);
  });

  it('should reject month 0', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: 0 }).success).toBe(false);
  });

  it('should reject month 13', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: 13 }).success).toBe(false);
  });

  it('should reject negative month', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: -1 }).success).toBe(false);
  });

  it('should reject non-integer month', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: 6.5 }).success).toBe(false);
  });

  it('should reject year 2019 (below minimum)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, year: 2019 }).success).toBe(false);
  });

  it('should reject year 2100 (above maximum)', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, year: 2100 }).success).toBe(false);
  });

  it('should reject missing month', () => {
    expect(generateMonthlyReportSchema.safeParse({ year: 2026 }).success).toBe(false);
  });

  it('should reject missing year', () => {
    expect(generateMonthlyReportSchema.safeParse({ month: 6 }).success).toBe(false);
  });

  it('should reject string month', () => {
    expect(generateMonthlyReportSchema.safeParse({ ...validInput, month: '6' }).success).toBe(false);
  });
});

// ── mergeToPayrollSchema ───────────────────────────────────────────────

describe('mergeToPayrollSchema', () => {
  it('should accept valid payrollRunId', () => {
    expect(mergeToPayrollSchema.safeParse({ payrollRunId: 'run-123' }).success).toBe(true);
  });

  it('should reject missing payrollRunId', () => {
    expect(mergeToPayrollSchema.safeParse({}).success).toBe(false);
  });

  it('should reject empty payrollRunId', () => {
    expect(mergeToPayrollSchema.safeParse({ payrollRunId: '' }).success).toBe(false);
  });

  it('should reject non-string payrollRunId', () => {
    expect(mergeToPayrollSchema.safeParse({ payrollRunId: 123 }).success).toBe(false);
  });
});

// ── listSlabConfigsSchema ──────────────────────────────────────────────

describe('listSlabConfigsSchema', () => {
  it('should accept empty object (all filters optional)', () => {
    expect(listSlabConfigsSchema.safeParse({}).success).toBe(true);
  });

  it('should accept all filters', () => {
    const result = listSlabConfigsSchema.safeParse({
      page: 1,
      limit: 20,
      search: 'widget',
      machineId: 'machine-1',
      partId: 'part-1',
      locationId: 'loc-1',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should coerce string page to number', () => {
    const result = listSlabConfigsSchema.safeParse({ page: '2' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(2);
  });

  it('should coerce string limit to number', () => {
    const result = listSlabConfigsSchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(10);
  });

  it('should coerce string isActive to boolean', () => {
    const result = listSlabConfigsSchema.safeParse({ isActive: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });

  it('should reject non-positive page', () => {
    expect(listSlabConfigsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listSlabConfigsSchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('should reject non-positive limit', () => {
    expect(listSlabConfigsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listSlabConfigsSchema.safeParse({ limit: -1 }).success).toBe(false);
  });
});

// ── listDailyEntriesSchema ─────────────────────────────────────────────

describe('listDailyEntriesSchema', () => {
  it('should accept empty object (all filters optional)', () => {
    expect(listDailyEntriesSchema.safeParse({}).success).toBe(true);
  });

  it('should accept all filters', () => {
    const result = listDailyEntriesSchema.safeParse({
      page: 1,
      limit: 20,
      entryDate: '2026-05-12',
      shiftId: 'shift-1',
      operatorId: 'op-1',
      machineId: 'machine-1',
      partId: 'part-1',
      status: 'APPROVED',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
  });

  it('should accept each valid status', () => {
    for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED']) {
      expect(listDailyEntriesSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    expect(listDailyEntriesSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(listDailyEntriesSchema.safeParse({ status: 'approved' }).success).toBe(false);
  });

  it('should reject invalid entryDate format', () => {
    expect(listDailyEntriesSchema.safeParse({ entryDate: '12/05/2026' }).success).toBe(false);
  });

  it('should accept valid YYYY-MM-DD entryDate', () => {
    expect(listDailyEntriesSchema.safeParse({ entryDate: '2026-01-01' }).success).toBe(true);
  });

  it('should coerce string page and limit', () => {
    const result = listDailyEntriesSchema.safeParse({ page: '3', limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(25);
    }
  });
});

// ── listMonthlyReportsSchema ───────────────────────────────────────────

describe('listMonthlyReportsSchema', () => {
  it('should accept empty object (all filters optional)', () => {
    expect(listMonthlyReportsSchema.safeParse({}).success).toBe(true);
  });

  it('should accept all filters', () => {
    const result = listMonthlyReportsSchema.safeParse({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      locationId: 'loc-1',
      year: 2026,
    });
    expect(result.success).toBe(true);
  });

  it('should accept each valid status', () => {
    for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MERGED']) {
      expect(listMonthlyReportsSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    expect(listMonthlyReportsSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
  });

  it('should coerce string year to number', () => {
    const result = listMonthlyReportsSchema.safeParse({ year: '2026' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.year).toBe(2026);
  });

  it('should coerce string page and limit', () => {
    const result = listMonthlyReportsSchema.safeParse({ page: '1', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('should reject non-positive page', () => {
    expect(listMonthlyReportsSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
