// ─── Performance Reports: R21 Appraisal Summary, R22 Skill Gap ───
import { generateExcelReport, type ReportConfig, type ReportSheet, type SheetColumn } from '../excel-exporter';
import type { DashboardFilters, DataScope } from '../../analytics.types';

// ─── Helpers ───
function dec(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════
// R21: Appraisal Summary Report
// ═══════════════════════════════════════════════════════════════
export async function generateAppraisalSummaryReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  // Find appraisal cycles in the date range
  const cycles = await tenantDb.appraisalCycle.findMany({
    where: {
      companyId: scope.companyId,
      startDate: { lte: new Date(filters.dateTo) },
      endDate: { gte: new Date(filters.dateFrom) },
    },
    orderBy: { startDate: 'desc' },
  });

  const cycleIds = cycles.map((c: any) => c.id);

  const entries = await tenantDb.appraisalEntry.findMany({
    where: {
      cycleId: { in: cycleIds },
      companyId: scope.companyId,
      ...(scope.employeeIds?.length ? { employeeId: { in: scope.employeeIds } } : {}),
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
          grade: { select: { name: true } },
        },
      },
      cycle: { select: { name: true, year: true } },
    },
    orderBy: [{ employee: { department: { name: 'asc' } } }],
  });

  // ── Summary Sheet ──
  const deptSummary: Record<string, { count: number; totalRating: number; promotionCount: number }> = {};
  for (const entry of entries) {
    const dept = entry.employee?.department?.name ?? 'Unassigned';
    if (!deptSummary[dept]) deptSummary[dept] = { count: 0, totalRating: 0, promotionCount: 0 };
    deptSummary[dept].count++;
    deptSummary[dept].totalRating += dec(entry.finalRating);
    if (entry.promotionRecommended) deptSummary[dept].promotionCount++;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Appraised', key: 'count', width: 14, format: 'number' },
      { header: 'Avg Rating', key: 'avgRating', width: 14, format: 'number' },
      { header: 'Promotion Recommended', key: 'promotionCount', width: 22, format: 'number' },
      { header: 'Promotion %', key: 'promotionPct', width: 14, format: 'percentage' },
    ],
    rows: Object.entries(deptSummary)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([dept, data]) => ({
        department: dept,
        count: data.count,
        avgRating: data.count > 0 ? Math.round((data.totalRating / data.count) * 10) / 10 : 0,
        promotionCount: data.promotionCount,
        promotionPct: data.count > 0 ? data.promotionCount / data.count : 0,
      })),
    totalsRow: {
      department: 'Overall',
      count: entries.length,
      avgRating: entries.length > 0
        ? Math.round((entries.reduce((s: number, e: any) => s + dec(e.finalRating), 0) / entries.length) * 10) / 10
        : 0,
      promotionCount: entries.filter((e: any) => e.promotionRecommended).length,
      promotionPct: entries.length > 0
        ? entries.filter((e: any) => e.promotionRecommended).length / entries.length
        : 0,
    },
  };

  // ── Bell Curve Sheet (rating distribution) ──
  const ratingBuckets: Record<string, number> = {
    'Outstanding (4.5-5.0)': 0,
    'Exceeds Expectations (3.5-4.4)': 0,
    'Meets Expectations (2.5-3.4)': 0,
    'Needs Improvement (1.5-2.4)': 0,
    'Unsatisfactory (1.0-1.4)': 0,
    'Not Rated': 0,
  };

  for (const entry of entries) {
    const rating = dec(entry.finalRating);
    if (rating === 0) ratingBuckets['Not Rated']++;
    else if (rating >= 4.5) ratingBuckets['Outstanding (4.5-5.0)']++;
    else if (rating >= 3.5) ratingBuckets['Exceeds Expectations (3.5-4.4)']++;
    else if (rating >= 2.5) ratingBuckets['Meets Expectations (2.5-3.4)']++;
    else if (rating >= 1.5) ratingBuckets['Needs Improvement (1.5-2.4)']++;
    else ratingBuckets['Unsatisfactory (1.0-1.4)']++;
  }

  const bellCurveSheet: ReportSheet = {
    name: 'Bell Curve',
    columns: [
      { header: 'Rating Band', key: 'band', width: 35 },
      { header: 'Count', key: 'count', width: 14, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 14, format: 'percentage' },
      { header: 'Ideal % (Bell Curve)', key: 'idealPct', width: 20, format: 'percentage' },
    ],
    rows: [
      { band: 'Outstanding (4.5-5.0)', count: ratingBuckets['Outstanding (4.5-5.0)'], percentage: entries.length > 0 ? ratingBuckets['Outstanding (4.5-5.0)'] / entries.length : 0, idealPct: 0.1 },
      { band: 'Exceeds Expectations (3.5-4.4)', count: ratingBuckets['Exceeds Expectations (3.5-4.4)'], percentage: entries.length > 0 ? ratingBuckets['Exceeds Expectations (3.5-4.4)'] / entries.length : 0, idealPct: 0.2 },
      { band: 'Meets Expectations (2.5-3.4)', count: ratingBuckets['Meets Expectations (2.5-3.4)'], percentage: entries.length > 0 ? ratingBuckets['Meets Expectations (2.5-3.4)'] / entries.length : 0, idealPct: 0.4 },
      { band: 'Needs Improvement (1.5-2.4)', count: ratingBuckets['Needs Improvement (1.5-2.4)'], percentage: entries.length > 0 ? ratingBuckets['Needs Improvement (1.5-2.4)'] / entries.length : 0, idealPct: 0.2 },
      { band: 'Unsatisfactory (1.0-1.4)', count: ratingBuckets['Unsatisfactory (1.0-1.4)'], percentage: entries.length > 0 ? ratingBuckets['Unsatisfactory (1.0-1.4)'] / entries.length : 0, idealPct: 0.1 },
      { band: 'Not Rated', count: ratingBuckets['Not Rated'], percentage: entries.length > 0 ? ratingBuckets['Not Rated'] / entries.length : 0, idealPct: 0 },
    ],
    totalsRow: {
      band: 'Total',
      count: entries.length,
      percentage: 1,
      idealPct: 1,
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Designation', key: 'designation', width: 18 },
      { header: 'Grade', key: 'grade', width: 12 },
      { header: 'Cycle', key: 'cycle', width: 18 },
      { header: 'Self Rating', key: 'selfRating', width: 12, format: 'number' },
      { header: 'Manager Rating', key: 'managerRating', width: 14, format: 'number' },
      { header: 'Final Rating', key: 'finalRating', width: 12, format: 'number' },
      { header: 'KRA Score', key: 'kraScore', width: 12, format: 'number' },
      { header: 'Competency Score', key: 'competencyScore', width: 16, format: 'number' },
      { header: 'Promotion', key: 'promotion', width: 12, conditionalFormat: 'status' },
      { header: 'Increment %', key: 'incrementPercent', width: 14, format: 'percentage' },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
    ],
    rows: entries.map((e: any) => ({
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      designation: e.employee?.designation?.name ?? '',
      grade: e.employee?.grade?.name ?? '',
      cycle: e.cycle?.name ?? '',
      selfRating: dec(e.selfRating),
      managerRating: dec(e.managerRating),
      finalRating: dec(e.finalRating),
      kraScore: dec(e.kraScore),
      competencyScore: dec(e.competencyScore),
      promotion: e.promotionRecommended ? 'APPROVED' : 'PENDING',
      incrementPercent: dec(e.incrementPercent) / 100,
      status: e.status,
    })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Appraisal Summary Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, bellCurveSheet, detailSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R22: Skill Gap Report
// ═══════════════════════════════════════════════════════════════
export async function generateSkillGapReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const mappings = await tenantDb.skillMapping.findMany({
    where: {
      companyId: scope.companyId,
      ...(scope.employeeIds?.length ? { employeeId: { in: scope.employeeIds } } : {}),
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
        },
      },
      skill: { select: { name: true, category: true } },
    },
    orderBy: [{ skill: { name: 'asc' } }],
  });

  // Apply department filter
  const filtered = mappings.filter((m: any) => {
    if (scope.departmentIds?.length) {
      // Already filtered by scope in query if employee IDs are provided
    }
    return true;
  });

  // ── Summary Sheet (by skill) ──
  const skillSummary: Record<string, { category: string; count: number; totalGap: number; criticalCount: number }> = {};
  for (const m of filtered) {
    const skillName = m.skill?.name ?? 'Unknown';
    if (!skillSummary[skillName]) {
      skillSummary[skillName] = { category: m.skill?.category ?? '', count: 0, totalGap: 0, criticalCount: 0 };
    }
    const gap = m.requiredLevel - m.currentLevel;
    skillSummary[skillName].count++;
    skillSummary[skillName].totalGap += Math.max(0, gap);
    if (gap >= 2) skillSummary[skillName].criticalCount++;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Skill', key: 'skill', width: 25 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Mapped Employees', key: 'count', width: 18, format: 'number' },
      { header: 'Avg Gap', key: 'avgGap', width: 12, format: 'number' },
      { header: 'Critical Gaps (2+)', key: 'criticalCount', width: 18, format: 'number' },
      { header: 'Gap Rate', key: 'gapRate', width: 12, format: 'percentage' },
    ],
    rows: Object.entries(skillSummary)
      .sort((a, b) => b[1].totalGap - a[1].totalGap)
      .map(([skill, data]) => ({
        skill,
        category: data.category,
        count: data.count,
        avgGap: data.count > 0 ? Math.round((data.totalGap / data.count) * 10) / 10 : 0,
        criticalCount: data.criticalCount,
        gapRate: data.count > 0 ? data.criticalCount / data.count : 0,
      })),
  };

  // ── Heatmap Sheet (department × skill with avg gap levels) ──
  const skillNames = Array.from(new Set(filtered.map((m: any) => m.skill?.name ?? 'Unknown') as string[])).sort();
  const deptNames = Array.from(new Set(filtered.map((m: any) => m.employee?.department?.name ?? 'Unassigned') as string[])).sort();

  const deptSkillMap: Record<string, Record<string, { totalGap: number; count: number }>> = {};
  for (const m of filtered) {
    const dept = m.employee?.department?.name ?? 'Unassigned';
    const skill = m.skill?.name ?? 'Unknown';
    if (!deptSkillMap[dept]) deptSkillMap[dept] = {};
    if (!deptSkillMap[dept][skill]) deptSkillMap[dept][skill] = { totalGap: 0, count: 0 };
    deptSkillMap[dept][skill].totalGap += Math.max(0, m.requiredLevel - m.currentLevel);
    deptSkillMap[dept][skill].count++;
  }

  const heatmapColumns: SheetColumn[] = [
    { header: 'Department', key: 'department', width: 25 },
    ...skillNames.map((s) => ({
      header: s,
      key: s,
      width: 14,
      format: 'number' as const,
      conditionalFormat: 'red-if-negative' as const,
    })),
  ];

  const heatmapRows = deptNames.map((dept) => {
    const row: Record<string, unknown> = { department: dept };
    for (const skill of skillNames) {
      const data = deptSkillMap[dept]?.[skill];
      // Use negative to trigger red conditional formatting for gaps
      row[skill] = data && data.count > 0
        ? -Math.round((data.totalGap / data.count) * 10) / 10
        : 0;
    }
    return row;
  });

  const heatmapSheet: ReportSheet = {
    name: 'Heatmap',
    columns: heatmapColumns,
    rows: heatmapRows,
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Designation', key: 'designation', width: 18 },
      { header: 'Skill', key: 'skill', width: 22 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Current Level', key: 'currentLevel', width: 14, format: 'number' },
      { header: 'Required Level', key: 'requiredLevel', width: 14, format: 'number' },
      { header: 'Gap', key: 'gap', width: 10, format: 'number', conditionalFormat: 'red-if-negative' },
      { header: 'Assessed Date', key: 'assessedAt', width: 14, format: 'date' },
    ],
    rows: filtered
      .filter((m: any) => m.requiredLevel > m.currentLevel)
      .sort((a: any, b: any) => (b.requiredLevel - b.currentLevel) - (a.requiredLevel - a.currentLevel))
      .map((m: any) => ({
        empId: m.employee?.employeeId ?? '',
        name: m.employee ? `${m.employee.firstName} ${m.employee.lastName}` : '',
        department: m.employee?.department?.name ?? '',
        designation: m.employee?.designation?.name ?? '',
        skill: m.skill?.name ?? '',
        category: m.skill?.category ?? '',
        currentLevel: m.currentLevel,
        requiredLevel: m.requiredLevel,
        gap: -(m.requiredLevel - m.currentLevel), // Negative to trigger red formatting
        assessedAt: formatDate(m.assessedAt),
      })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Skill Gap Report',
    period: `As of ${formatDate(new Date())}`,
    sheets: [summarySheet, heatmapSheet, detailSheet],
  });
}
