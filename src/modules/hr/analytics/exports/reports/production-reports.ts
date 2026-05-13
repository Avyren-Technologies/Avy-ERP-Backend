// ─── Production Reports: PIP Daily Production, Incentive Summary, Operator Performance,
//     Machine Utilization, Shift Productivity, Payroll Merge, Exception ───
import { generateExcelReport, type ReportConfig, type ReportSheet, type SheetColumn } from '../excel-exporter';
import type { DashboardFilters, DataScope } from '../../analytics.types';
import { platformPrisma } from '../../../../../config/database';

// ─── Helpers ───
function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dec(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

function buildPipWhere(filters: DashboardFilters, scope: DataScope) {
  const where: Record<string, unknown> = { companyId: scope.companyId };
  if (filters.dateFrom) where.entryDate = { ...(where.entryDate as any ?? {}), gte: new Date(filters.dateFrom) };
  if (filters.dateTo) where.entryDate = { ...(where.entryDate as any ?? {}), lte: new Date(filters.dateTo) };
  if (filters.locationId) where.locationId = filters.locationId;
  if (scope.locationIds?.length) where.locationId = { in: scope.locationIds };
  if (filters.shiftId) where.shiftId = filters.shiftId;
  return where;
}

/** Build lookup maps for machine, part, and shift names from their IDs */
async function buildLookups(_companyId: string, entries: Array<{ machineId: string; partId: string; shiftId: string }>) {
  const machineIds = [...new Set(entries.map(e => e.machineId))];
  const partIds = [...new Set(entries.map(e => e.partId))];
  const shiftIds = [...new Set(entries.map(e => e.shiftId))];

  const [machines, parts, shifts] = await Promise.all([
    machineIds.length > 0
      ? platformPrisma.machine.findMany({ where: { id: { in: machineIds } }, select: { id: true, assetName: true, assetCode: true } })
      : [] as Array<{ id: string; assetName: string; assetCode: string }>,
    partIds.length > 0
      ? platformPrisma.part.findMany({ where: { id: { in: partIds } }, select: { id: true, name: true, partNumber: true } })
      : [] as Array<{ id: string; name: string; partNumber: string }>,
    shiftIds.length > 0
      ? platformPrisma.companyShift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, name: true } })
      : [] as Array<{ id: string; name: string }>,
  ]);

  const machineMap = new Map<string, string>(machines.map(m => [m.id, m.assetName ?? m.assetCode ?? m.id]));
  const partMap = new Map<string, string>(parts.map(p => [p.id, p.name ?? p.partNumber ?? p.id]));
  const shiftMap = new Map<string, string>(shifts.map(s => [s.id, s.name ?? s.id]));

  return { machineMap, partMap, shiftMap };
}

// ═══════════════════════════════════════════════════════════════
// R26: PIP Daily Production Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipDailyProductionReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  const entries = await platformPrisma.pipDailyEntry.findMany({
    where,
    include: {
      operator: { select: { firstName: true, lastName: true, employeeId: true } },
    },
    orderBy: [{ entryDate: 'desc' }],
  });

  const { machineMap, partMap, shiftMap } = await buildLookups(scope.companyId, entries);

  // ── Summary Sheet ──
  const totalQty = entries.reduce((s, e) => s + e.qtyProduced, 0);
  const totalIncentive = entries.reduce((s, e) => s + dec(e.totalIncentive), 0);
  const eligibleCount = entries.filter(e => e.isEligible).length;
  const uniqueOperators = new Set(entries.map(e => e.operatorId)).size;
  const uniqueMachines = new Set(entries.map(e => e.machineId)).size;

  const summaryColumns: SheetColumn[] = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  const summaryRows: Record<string, unknown>[] = [
    { metric: 'Total Entries', value: entries.length },
    { metric: 'Total Qty Produced', value: totalQty },
    { metric: 'Total Incentive', value: totalIncentive },
    { metric: 'Eligible Entries', value: eligibleCount },
    { metric: 'Unique Operators', value: uniqueOperators },
    { metric: 'Unique Machines', value: uniqueMachines },
  ];
  const summarySheet: ReportSheet = { name: 'Summary', columns: summaryColumns, rows: summaryRows };

  // ── Operator Detail Sheet ──
  const detailColumns: SheetColumn[] = [
    { header: 'Date', key: 'entryDate', width: 14, format: 'date' },
    { header: 'Emp ID', key: 'employeeId', width: 14 },
    { header: 'Operator', key: 'operatorName', width: 22 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Machine', key: 'machine', width: 18 },
    { header: 'Part', key: 'part', width: 18 },
    { header: 'Target Qty', key: 'shiftTargetQty', width: 12, format: 'number' },
    { header: 'Produced', key: 'qtyProduced', width: 12, format: 'number' },
    { header: 'Achievement %', key: 'achievementPct', width: 14, format: 'percentage' },
    { header: 'Eligible', key: 'isEligible', width: 10 },
    { header: 'Incentive', key: 'totalIncentive', width: 14, format: 'currency' },
    { header: 'NC Count', key: 'ncCount', width: 10, format: 'number' },
  ];
  const detailRows = entries.map((e: any) => ({
    entryDate: e.entryDate,
    employeeId: e.operator?.employeeId ?? '',
    operatorName: `${e.operator?.firstName ?? ''} ${e.operator?.lastName ?? ''}`.trim(),
    shift: shiftMap.get(e.shiftId) ?? '',
    machine: machineMap.get(e.machineId) ?? '',
    part: partMap.get(e.partId) ?? '',
    shiftTargetQty: e.shiftTargetQty,
    qtyProduced: e.qtyProduced,
    achievementPct: dec(e.achievementPct) / 100,
    isEligible: e.isEligible ? 'Yes' : 'No',
    totalIncentive: dec(e.totalIncentive),
    ncCount: e.ncCount,
  }));
  const detailSheet: ReportSheet = { name: 'Operator Detail', columns: detailColumns, rows: detailRows };

  // ── Machine Utilization Sheet ──
  const machineAggMap = new Map<string, { name: string; totalQty: number; entries: number; totalIncentive: number }>();
  for (const e of entries) {
    const key = e.machineId;
    const existing = machineAggMap.get(key);
    if (existing) {
      existing.totalQty += e.qtyProduced;
      existing.entries += 1;
      existing.totalIncentive += dec(e.totalIncentive);
    } else {
      machineAggMap.set(key, {
        name: machineMap.get(key) ?? key,
        totalQty: e.qtyProduced,
        entries: 1,
        totalIncentive: dec(e.totalIncentive),
      });
    }
  }
  const machColumns: SheetColumn[] = [
    { header: 'Machine', key: 'machine', width: 22 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Total Qty', key: 'totalQty', width: 14, format: 'number' },
    { header: 'Avg Qty/Entry', key: 'avgQty', width: 14, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const machRows = Array.from(machineAggMap.values()).map(m => ({
    machine: m.name,
    entries: m.entries,
    totalQty: m.totalQty,
    avgQty: m.entries > 0 ? Math.round(m.totalQty / m.entries) : 0,
    totalIncentive: m.totalIncentive,
  }));
  const machSheet: ReportSheet = { name: 'Machine Utilization', columns: machColumns, rows: machRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Daily Production Report',
    period,
    sheets: [summarySheet, detailSheet, machSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R27: PIP Incentive Summary Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipIncentiveSummaryReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  const entries = await platformPrisma.pipDailyEntry.findMany({
    where,
    include: {
      operator: { select: { firstName: true, lastName: true, employeeId: true } },
    },
    orderBy: { entryDate: 'asc' },
  });

  const { partMap } = await buildLookups(scope.companyId, entries);

  // ── Monthly Summary Sheet ──
  const totalIncentive = entries.reduce((s, e) => s + dec(e.totalIncentive), 0);
  const eligibleEntries = entries.filter(e => e.isEligible);
  const uniqueOperators = new Set(entries.map(e => e.operatorId)).size;
  const uniqueDates = new Set(entries.map(e => formatDate(e.entryDate))).size;

  const monthlySummaryColumns: SheetColumn[] = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  const monthlySummaryRows: Record<string, unknown>[] = [
    { metric: 'Total Incentive Amount', value: totalIncentive },
    { metric: 'Total Entries', value: entries.length },
    { metric: 'Eligible Entries', value: eligibleEntries.length },
    { metric: 'Unique Operators', value: uniqueOperators },
    { metric: 'Working Days', value: uniqueDates },
    { metric: 'Avg Incentive/Day', value: uniqueDates > 0 ? Math.round(totalIncentive / uniqueDates) : 0 },
  ];
  const monthlySummarySheet: ReportSheet = { name: 'Monthly Summary', columns: monthlySummaryColumns, rows: monthlySummaryRows };

  // ── Operator-wise Sheet ──
  const opAggMap = new Map<string, { empId: string; name: string; daysEligible: number; totalIncentive: number; totalEntries: number }>();
  for (const e of entries) {
    const key = e.operatorId;
    const existing = opAggMap.get(key);
    if (existing) {
      existing.totalEntries += 1;
      existing.daysEligible += e.isEligible ? 1 : 0;
      existing.totalIncentive += dec(e.totalIncentive);
    } else {
      opAggMap.set(key, {
        empId: (e as any).operator?.employeeId ?? '',
        name: `${(e as any).operator?.firstName ?? ''} ${(e as any).operator?.lastName ?? ''}`.trim(),
        totalEntries: 1,
        daysEligible: e.isEligible ? 1 : 0,
        totalIncentive: dec(e.totalIncentive),
      });
    }
  }
  const opColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Operator', key: 'name', width: 22 },
    { header: 'Total Entries', key: 'totalEntries', width: 14, format: 'number' },
    { header: 'Days Eligible', key: 'daysEligible', width: 14, format: 'number' },
    { header: 'Eligibility Rate', key: 'eligibilityRate', width: 16, format: 'percentage' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
    { header: 'Avg/Day', key: 'avgPerDay', width: 14, format: 'currency' },
  ];
  const opRows = Array.from(opAggMap.values()).map(o => ({
    empId: o.empId,
    name: o.name,
    totalEntries: o.totalEntries,
    daysEligible: o.daysEligible,
    eligibilityRate: o.totalEntries > 0 ? o.daysEligible / o.totalEntries : 0,
    totalIncentive: o.totalIncentive,
    avgPerDay: o.daysEligible > 0 ? Math.round(o.totalIncentive / o.daysEligible) : 0,
  }));
  const opSheet: ReportSheet = { name: 'Operator-wise', columns: opColumns, rows: opRows };

  // ── Part-wise Sheet ──
  const partAggMap = new Map<string, { name: string; excessPcs: number; totalIncentive: number; entries: number }>();
  for (const e of entries) {
    const key = e.partId;
    const excess = Math.max(0, e.qtyProduced - e.shiftTargetQty);
    const existing = partAggMap.get(key);
    if (existing) {
      existing.excessPcs += excess;
      existing.totalIncentive += dec(e.totalIncentive);
      existing.entries += 1;
    } else {
      partAggMap.set(key, {
        name: partMap.get(key) ?? key,
        excessPcs: excess,
        totalIncentive: dec(e.totalIncentive),
        entries: 1,
      });
    }
  }
  const partColumns: SheetColumn[] = [
    { header: 'Part', key: 'name', width: 22 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Excess Pcs', key: 'excessPcs', width: 14, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const partRows = Array.from(partAggMap.values()).map(p => ({
    name: p.name,
    entries: p.entries,
    excessPcs: p.excessPcs,
    totalIncentive: p.totalIncentive,
  }));
  const partSheet: ReportSheet = { name: 'Part-wise', columns: partColumns, rows: partRows };

  // ── Daily Trend Sheet ──
  const dailyMap = new Map<string, { date: string; totalIncentive: number; entries: number; eligible: number }>();
  for (const e of entries) {
    const key = formatDate(e.entryDate);
    const existing = dailyMap.get(key);
    if (existing) {
      existing.totalIncentive += dec(e.totalIncentive);
      existing.entries += 1;
      existing.eligible += e.isEligible ? 1 : 0;
    } else {
      dailyMap.set(key, {
        date: key,
        totalIncentive: dec(e.totalIncentive),
        entries: 1,
        eligible: e.isEligible ? 1 : 0,
      });
    }
  }
  const dailyColumns: SheetColumn[] = [
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Eligible', key: 'eligible', width: 12, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const dailyRows = Array.from(dailyMap.values());
  const dailySheet: ReportSheet = { name: 'Daily Trend', columns: dailyColumns, rows: dailyRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Incentive Summary Report',
    period,
    sheets: [monthlySummarySheet, opSheet, partSheet, dailySheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R28: PIP Operator Performance Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipOperatorPerformanceReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  const entries = await platformPrisma.pipDailyEntry.findMany({
    where,
    include: {
      operator: { select: { firstName: true, lastName: true, employeeId: true } },
    },
    orderBy: [{ operatorId: 'asc' }, { entryDate: 'asc' }],
  });

  // ── Summary Sheet (per operator aggregate) ──
  const opAggMap = new Map<string, {
    empId: string; name: string; totalEntries: number; eligible: number;
    totalIncentive: number; sumAchievement: number;
  }>();
  for (const e of entries) {
    const key = e.operatorId;
    const existing = opAggMap.get(key);
    if (existing) {
      existing.totalEntries += 1;
      existing.eligible += e.isEligible ? 1 : 0;
      existing.totalIncentive += dec(e.totalIncentive);
      existing.sumAchievement += dec(e.achievementPct);
    } else {
      opAggMap.set(key, {
        empId: (e as any).operator?.employeeId ?? '',
        name: `${(e as any).operator?.firstName ?? ''} ${(e as any).operator?.lastName ?? ''}`.trim(),
        totalEntries: 1,
        eligible: e.isEligible ? 1 : 0,
        totalIncentive: dec(e.totalIncentive),
        sumAchievement: dec(e.achievementPct),
      });
    }
  }

  const summaryColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Operator', key: 'name', width: 22 },
    { header: 'Total Entries', key: 'totalEntries', width: 14, format: 'number' },
    { header: 'Avg Achievement %', key: 'avgAchievement', width: 18, format: 'percentage' },
    { header: 'Eligibility Rate', key: 'eligibilityRate', width: 16, format: 'percentage' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const summaryRows = Array.from(opAggMap.values()).map(o => ({
    empId: o.empId,
    name: o.name,
    totalEntries: o.totalEntries,
    avgAchievement: o.totalEntries > 0 ? (o.sumAchievement / o.totalEntries) / 100 : 0,
    eligibilityRate: o.totalEntries > 0 ? o.eligible / o.totalEntries : 0,
    totalIncentive: o.totalIncentive,
  }));
  const summarySheet: ReportSheet = { name: 'Summary', columns: summaryColumns, rows: summaryRows };

  // ── Detail Sheet (per operator per day) ──
  const detailColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Operator', key: 'name', width: 22 },
    { header: 'Date', key: 'entryDate', width: 14, format: 'date' },
    { header: 'Achievement %', key: 'achievementPct', width: 16, format: 'percentage' },
    { header: 'Eligible', key: 'isEligible', width: 10 },
    { header: 'Incentive', key: 'totalIncentive', width: 14, format: 'currency' },
  ];
  const detailRows = entries.map((e: any) => ({
    empId: e.operator?.employeeId ?? '',
    name: `${e.operator?.firstName ?? ''} ${e.operator?.lastName ?? ''}`.trim(),
    entryDate: e.entryDate,
    achievementPct: dec(e.achievementPct) / 100,
    isEligible: e.isEligible ? 'Yes' : 'No',
    totalIncentive: dec(e.totalIncentive),
  }));
  const detailSheet: ReportSheet = { name: 'Detail', columns: detailColumns, rows: detailRows };

  // ── Achievement Trend Sheet (daily average achievement) ──
  const trendMap = new Map<string, { date: string; sumAchievement: number; count: number }>();
  for (const e of entries) {
    const key = formatDate(e.entryDate);
    const existing = trendMap.get(key);
    if (existing) {
      existing.sumAchievement += dec(e.achievementPct);
      existing.count += 1;
    } else {
      trendMap.set(key, { date: key, sumAchievement: dec(e.achievementPct), count: 1 });
    }
  }
  const trendColumns: SheetColumn[] = [
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Entries', key: 'count', width: 12, format: 'number' },
    { header: 'Avg Achievement %', key: 'avgAchievement', width: 18, format: 'percentage' },
  ];
  const trendRows = Array.from(trendMap.values()).map(t => ({
    date: t.date,
    count: t.count,
    avgAchievement: t.count > 0 ? (t.sumAchievement / t.count) / 100 : 0,
  }));
  const trendSheet: ReportSheet = { name: 'Achievement Trend', columns: trendColumns, rows: trendRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Operator Performance Report',
    period,
    sheets: [summarySheet, detailSheet, trendSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R29: PIP Machine Utilization Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipMachineUtilizationReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  const entries = await platformPrisma.pipDailyEntry.findMany({
    where,
    orderBy: [{ machineId: 'asc' }, { entryDate: 'asc' }],
  });

  const { machineMap, shiftMap } = await buildLookups(scope.companyId, entries);

  // ── Summary Sheet ──
  const machineAggMap = new Map<string, { name: string; totalQty: number; totalTarget: number; entries: number; totalIncentive: number }>();
  for (const e of entries) {
    const key = e.machineId;
    const existing = machineAggMap.get(key);
    if (existing) {
      existing.totalQty += e.qtyProduced;
      existing.totalTarget += e.shiftTargetQty;
      existing.entries += 1;
      existing.totalIncentive += dec(e.totalIncentive);
    } else {
      machineAggMap.set(key, {
        name: machineMap.get(key) ?? key,
        totalQty: e.qtyProduced,
        totalTarget: e.shiftTargetQty,
        entries: 1,
        totalIncentive: dec(e.totalIncentive),
      });
    }
  }

  const summaryColumns: SheetColumn[] = [
    { header: 'Machine', key: 'machine', width: 22 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Total Target', key: 'totalTarget', width: 14, format: 'number' },
    { header: 'Total Output', key: 'totalQty', width: 14, format: 'number' },
    { header: 'Utilization %', key: 'utilization', width: 14, format: 'percentage' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const summaryRows = Array.from(machineAggMap.values()).map(m => ({
    machine: m.name,
    entries: m.entries,
    totalTarget: m.totalTarget,
    totalQty: m.totalQty,
    utilization: m.totalTarget > 0 ? m.totalQty / m.totalTarget : 0,
    totalIncentive: m.totalIncentive,
  }));
  const summarySheet: ReportSheet = { name: 'Summary', columns: summaryColumns, rows: summaryRows };

  // ── Machine-wise Detail Sheet ──
  const mDetailColumns: SheetColumn[] = [
    { header: 'Machine', key: 'machine', width: 22 },
    { header: 'Date', key: 'entryDate', width: 14, format: 'date' },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Target', key: 'shiftTargetQty', width: 12, format: 'number' },
    { header: 'Produced', key: 'qtyProduced', width: 12, format: 'number' },
    { header: 'Achievement %', key: 'achievementPct', width: 14, format: 'percentage' },
    { header: 'Incentive', key: 'totalIncentive', width: 14, format: 'currency' },
  ];
  const mDetailRows = entries.map((e) => ({
    machine: machineMap.get(e.machineId) ?? '',
    entryDate: e.entryDate,
    shift: shiftMap.get(e.shiftId) ?? '',
    shiftTargetQty: e.shiftTargetQty,
    qtyProduced: e.qtyProduced,
    achievementPct: dec(e.achievementPct) / 100,
    totalIncentive: dec(e.totalIncentive),
  }));
  const mDetailSheet: ReportSheet = { name: 'Machine-wise', columns: mDetailColumns, rows: mDetailRows };

  // ── Shift Analysis Sheet (by shift per machine) ──
  const shiftMachineMap = new Map<string, { machine: string; shift: string; totalQty: number; totalTarget: number; entries: number }>();
  for (const e of entries) {
    const key = `${e.machineId}|${e.shiftId}`;
    const existing = shiftMachineMap.get(key);
    if (existing) {
      existing.totalQty += e.qtyProduced;
      existing.totalTarget += e.shiftTargetQty;
      existing.entries += 1;
    } else {
      shiftMachineMap.set(key, {
        machine: machineMap.get(e.machineId) ?? '',
        shift: shiftMap.get(e.shiftId) ?? '',
        totalQty: e.qtyProduced,
        totalTarget: e.shiftTargetQty,
        entries: 1,
      });
    }
  }
  const shiftAnalysisColumns: SheetColumn[] = [
    { header: 'Machine', key: 'machine', width: 22 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Total Target', key: 'totalTarget', width: 14, format: 'number' },
    { header: 'Total Output', key: 'totalQty', width: 14, format: 'number' },
    { header: 'Avg Output/Entry', key: 'avgOutput', width: 16, format: 'number' },
  ];
  const shiftAnalysisRows = Array.from(shiftMachineMap.values()).map(s => ({
    machine: s.machine,
    shift: s.shift,
    entries: s.entries,
    totalTarget: s.totalTarget,
    totalQty: s.totalQty,
    avgOutput: s.entries > 0 ? Math.round(s.totalQty / s.entries) : 0,
  }));
  const shiftAnalysisSheet: ReportSheet = { name: 'Shift Analysis', columns: shiftAnalysisColumns, rows: shiftAnalysisRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Machine Utilization Report',
    period,
    sheets: [summarySheet, mDetailSheet, shiftAnalysisSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R30: PIP Shift Productivity Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipShiftProductivityReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  const entries = await platformPrisma.pipDailyEntry.findMany({
    where,
    orderBy: [{ shiftId: 'asc' }, { entryDate: 'asc' }],
  });

  const { shiftMap } = await buildLookups(scope.companyId, entries);

  // ── Summary Sheet ──
  const shiftAggMap = new Map<string, { name: string; totalQty: number; totalTarget: number; entries: number; totalIncentive: number; eligible: number }>();
  for (const e of entries) {
    const key = e.shiftId;
    const existing = shiftAggMap.get(key);
    if (existing) {
      existing.totalQty += e.qtyProduced;
      existing.totalTarget += e.shiftTargetQty;
      existing.entries += 1;
      existing.totalIncentive += dec(e.totalIncentive);
      existing.eligible += e.isEligible ? 1 : 0;
    } else {
      shiftAggMap.set(key, {
        name: shiftMap.get(key) ?? key,
        totalQty: e.qtyProduced,
        totalTarget: e.shiftTargetQty,
        entries: 1,
        totalIncentive: dec(e.totalIncentive),
        eligible: e.isEligible ? 1 : 0,
      });
    }
  }

  const summaryColumns: SheetColumn[] = [
    { header: 'Shift', key: 'shift', width: 18 },
    { header: 'Total Entries', key: 'entries', width: 14, format: 'number' },
    { header: 'Avg Output', key: 'avgOutput', width: 14, format: 'number' },
    { header: 'Target Achievement', key: 'targetAchievement', width: 18, format: 'percentage' },
    { header: 'Eligibility Rate', key: 'eligibilityRate', width: 16, format: 'percentage' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const summaryRows = Array.from(shiftAggMap.values()).map(s => ({
    shift: s.name,
    entries: s.entries,
    avgOutput: s.entries > 0 ? Math.round(s.totalQty / s.entries) : 0,
    targetAchievement: s.totalTarget > 0 ? s.totalQty / s.totalTarget : 0,
    eligibilityRate: s.entries > 0 ? s.eligible / s.entries : 0,
    totalIncentive: s.totalIncentive,
  }));
  const summarySheet: ReportSheet = { name: 'Summary', columns: summaryColumns, rows: summaryRows };

  // ── Shift Comparison Sheet ──
  const comparisonColumns: SheetColumn[] = [
    { header: 'Shift', key: 'shift', width: 18 },
    { header: 'Total Output', key: 'totalQty', width: 14, format: 'number' },
    { header: 'Total Target', key: 'totalTarget', width: 14, format: 'number' },
    { header: 'Eligible Entries', key: 'eligible', width: 14, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
    { header: 'Incentive/Entry', key: 'incentivePerEntry', width: 16, format: 'currency' },
  ];
  const comparisonRows = Array.from(shiftAggMap.values()).map(s => ({
    shift: s.name,
    totalQty: s.totalQty,
    totalTarget: s.totalTarget,
    eligible: s.eligible,
    totalIncentive: s.totalIncentive,
    incentivePerEntry: s.entries > 0 ? Math.round(s.totalIncentive / s.entries) : 0,
  }));
  const comparisonSheet: ReportSheet = { name: 'Shift Comparison', columns: comparisonColumns, rows: comparisonRows };

  // ── Trend Sheet (daily by shift) ──
  const dailyShiftMap = new Map<string, { date: string; shift: string; totalQty: number; entries: number; totalIncentive: number }>();
  for (const e of entries) {
    const key = `${formatDate(e.entryDate)}|${e.shiftId}`;
    const existing = dailyShiftMap.get(key);
    if (existing) {
      existing.totalQty += e.qtyProduced;
      existing.entries += 1;
      existing.totalIncentive += dec(e.totalIncentive);
    } else {
      dailyShiftMap.set(key, {
        date: formatDate(e.entryDate),
        shift: shiftMap.get(e.shiftId) ?? '',
        totalQty: e.qtyProduced,
        entries: 1,
        totalIncentive: dec(e.totalIncentive),
      });
    }
  }
  const trendColumns: SheetColumn[] = [
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Shift', key: 'shift', width: 18 },
    { header: 'Total Output', key: 'totalQty', width: 14, format: 'number' },
    { header: 'Entries', key: 'entries', width: 12, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const trendRows = Array.from(dailyShiftMap.values());
  const trendSheet: ReportSheet = { name: 'Trend', columns: trendColumns, rows: trendRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Shift Productivity Report',
    period,
    sheets: [summarySheet, comparisonSheet, trendSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R31: PIP Payroll Merge Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipPayrollMergeReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  // Query monthly reports with MERGED status
  const monthlyWhere: Record<string, unknown> = { companyId: scope.companyId, status: 'MERGED' };
  if (filters.month) monthlyWhere.month = filters.month;
  if (filters.year) monthlyWhere.year = filters.year;
  if (filters.locationId) monthlyWhere.locationId = filters.locationId;
  if (scope.locationIds?.length) monthlyWhere.locationId = { in: scope.locationIds };

  const reports = await platformPrisma.pipMonthlyReport.findMany({
    where: monthlyWhere,
    include: {
      location: { select: { name: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  // ── Merge Summary Sheet ──
  const mergeSummaryColumns: SheetColumn[] = [
    { header: 'Report ID', key: 'id', width: 28 },
    { header: 'Month', key: 'monthYear', width: 14 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Operator Count', key: 'operatorCount', width: 16, format: 'number' },
    { header: 'Working Days', key: 'workingDays', width: 14, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
    { header: 'Avg/Day', key: 'avgPerDay', width: 14, format: 'currency' },
    { header: 'Approved At', key: 'approvedAt', width: 18, format: 'date' },
  ];
  const mergeSummaryRows = reports.map((r: any) => ({
    id: r.id,
    monthYear: `${String(r.month).padStart(2, '0')}/${r.year}`,
    location: r.location?.name ?? 'All',
    operatorCount: r.operatorCount,
    workingDays: r.workingDays,
    totalIncentive: dec(r.totalIncentive),
    avgPerDay: dec(r.avgPerDay),
    approvedAt: r.approvedAt,
  }));
  const mergeSummarySheet: ReportSheet = { name: 'Merge Summary', columns: mergeSummaryColumns, rows: mergeSummaryRows };

  // ── Employee Detail Sheet (from operatorSummary JSON in each report) ──
  const empDetailColumns: SheetColumn[] = [
    { header: 'Month', key: 'monthYear', width: 14 },
    { header: 'Operator ID', key: 'operatorId', width: 28 },
    { header: 'Operator Name', key: 'operatorName', width: 22 },
    { header: 'Days Eligible', key: 'daysEligible', width: 14, format: 'number' },
    { header: 'Total Incentive', key: 'totalIncentive', width: 16, format: 'currency' },
  ];
  const empDetailRows: Record<string, unknown>[] = [];
  for (const r of reports) {
    const operatorSummary = r.operatorSummary as any[] | null;
    if (Array.isArray(operatorSummary)) {
      for (const op of operatorSummary) {
        empDetailRows.push({
          monthYear: `${String(r.month).padStart(2, '0')}/${r.year}`,
          operatorId: op.operatorId ?? '',
          operatorName: op.operatorName ?? op.name ?? '',
          daysEligible: op.daysEligible ?? op.eligibleDays ?? 0,
          totalIncentive: dec(op.totalIncentive ?? op.incentive ?? 0),
        });
      }
    }
  }
  const empDetailSheet: ReportSheet = { name: 'Employee Detail', columns: empDetailColumns, rows: empDetailRows };

  const period = filters.year ? `${filters.month ? String(filters.month).padStart(2, '0') + '/' : ''}${filters.year}` : `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Payroll Merge Report',
    period,
    sheets: [mergeSummarySheet, empDetailSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R32: PIP Exception Report
// ═══════════════════════════════════════════════════════════════
export async function generatePipExceptionReport(
  _tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildPipWhere(filters, scope);

  // ── Below Target: entries where isEligible = false ──
  const belowTargetEntries = await platformPrisma.pipDailyEntry.findMany({
    where: { ...where, isEligible: false },
    include: {
      operator: { select: { firstName: true, lastName: true, employeeId: true } },
    },
    orderBy: [{ entryDate: 'desc' }],
  });

  const btLookups = await buildLookups(scope.companyId, belowTargetEntries);

  const belowTargetColumns: SheetColumn[] = [
    { header: 'Date', key: 'entryDate', width: 14, format: 'date' },
    { header: 'Emp ID', key: 'employeeId', width: 14 },
    { header: 'Operator', key: 'operatorName', width: 22 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Machine', key: 'machine', width: 18 },
    { header: 'Part', key: 'part', width: 18 },
    { header: 'Target', key: 'shiftTargetQty', width: 12, format: 'number' },
    { header: 'Produced', key: 'qtyProduced', width: 12, format: 'number' },
    { header: 'Achievement %', key: 'achievementPct', width: 14, format: 'percentage' },
    { header: 'NC Count', key: 'ncCount', width: 10, format: 'number' },
    { header: 'NC Reason', key: 'ncReason', width: 24 },
  ];
  const belowTargetRows = belowTargetEntries.map((e: any) => ({
    entryDate: e.entryDate,
    employeeId: e.operator?.employeeId ?? '',
    operatorName: `${e.operator?.firstName ?? ''} ${e.operator?.lastName ?? ''}`.trim(),
    shift: btLookups.shiftMap.get(e.shiftId) ?? '',
    machine: btLookups.machineMap.get(e.machineId) ?? '',
    part: btLookups.partMap.get(e.partId) ?? '',
    shiftTargetQty: e.shiftTargetQty,
    qtyProduced: e.qtyProduced,
    achievementPct: dec(e.achievementPct) / 100,
    ncCount: e.ncCount,
    ncReason: e.ncReason ?? '',
  }));
  const belowTargetSheet: ReportSheet = { name: 'Below Target', columns: belowTargetColumns, rows: belowTargetRows };

  // ── Missing Entries: find operators who have some entries but missing for certain dates ──
  const allEntries = await platformPrisma.pipDailyEntry.findMany({
    where,
    select: { operatorId: true, entryDate: true },
  });

  // Get all unique dates and operators
  const allDates = [...new Set(allEntries.map(e => e.entryDate.toISOString().split('T')[0]!))].sort();
  const allOperatorIds = [...new Set(allEntries.map(e => e.operatorId))];
  const entrySet = new Set(allEntries.map(e => `${e.operatorId}|${e.entryDate.toISOString().split('T')[0]}`));

  // Find operators with entries in the period
  const operators = allOperatorIds.length > 0
    ? await platformPrisma.employee.findMany({
        where: { id: { in: allOperatorIds } },
        select: { id: true, firstName: true, lastName: true, employeeId: true },
      })
    : [];
  const operatorLookup = new Map(operators.map(o => [o.id, o]));

  const missingColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'employeeId', width: 14 },
    { header: 'Operator', key: 'operatorName', width: 22 },
    { header: 'Missing Date', key: 'missingDate', width: 16 },
  ];
  const missingRows: Record<string, unknown>[] = [];
  for (const opId of allOperatorIds) {
    const op = operatorLookup.get(opId);
    for (const date of allDates) {
      if (!entrySet.has(`${opId}|${date}`)) {
        missingRows.push({
          employeeId: op?.employeeId ?? '',
          operatorName: op ? `${op.firstName ?? ''} ${op.lastName ?? ''}`.trim() : opId,
          missingDate: date,
        });
      }
    }
  }
  const missingSheet: ReportSheet = { name: 'Missing Entries', columns: missingColumns, rows: missingRows };

  // ── Duplicates: entries with same operator+date+machine+shift (more than one) ──
  const allEntriesForDup = await platformPrisma.pipDailyEntry.findMany({
    where,
    include: {
      operator: { select: { firstName: true, lastName: true, employeeId: true } },
    },
  });

  const dupCountMap = new Map<string, number>();
  for (const e of allEntriesForDup) {
    const key = `${e.operatorId}|${e.entryDate.toISOString().split('T')[0]}|${e.machineId}|${e.shiftId}`;
    dupCountMap.set(key, (dupCountMap.get(key) ?? 0) + 1);
  }

  const dupLookups = await buildLookups(scope.companyId, allEntriesForDup);

  const dupColumns: SheetColumn[] = [
    { header: 'Date', key: 'entryDate', width: 14, format: 'date' },
    { header: 'Emp ID', key: 'employeeId', width: 14 },
    { header: 'Operator', key: 'operatorName', width: 22 },
    { header: 'Machine', key: 'machine', width: 18 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Occurrences', key: 'occurrences', width: 14, format: 'number' },
  ];
  const dupRows: Record<string, unknown>[] = [];
  const seenDupKeys = new Set<string>();
  for (const e of allEntriesForDup) {
    const key = `${e.operatorId}|${e.entryDate.toISOString().split('T')[0]}|${e.machineId}|${e.shiftId}`;
    const count = dupCountMap.get(key) ?? 0;
    if (count > 1 && !seenDupKeys.has(key)) {
      seenDupKeys.add(key);
      dupRows.push({
        entryDate: e.entryDate,
        employeeId: (e as any).operator?.employeeId ?? '',
        operatorName: `${(e as any).operator?.firstName ?? ''} ${(e as any).operator?.lastName ?? ''}`.trim(),
        machine: dupLookups.machineMap.get(e.machineId) ?? '',
        shift: dupLookups.shiftMap.get(e.shiftId) ?? '',
        occurrences: count,
      });
    }
  }
  const dupSheet: ReportSheet = { name: 'Duplicates', columns: dupColumns, rows: dupRows };

  const period = `${filters.dateFrom ?? ''} to ${filters.dateTo ?? ''}`;
  const config: ReportConfig = {
    companyName,
    reportTitle: 'PIP Exception Report',
    period,
    sheets: [belowTargetSheet, missingSheet, dupSheet],
  };

  return generateExcelReport(config);
}
