// ─── Payroll Reports: R11 Salary Register, R12 Bank Transfer, R13 CTC Distribution,
//     R14 Salary Revision, R15 Loan Outstanding ───
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

function jsonObj(val: unknown): Record<string, number> {
  if (!val || typeof val !== 'object') return {};
  return val as Record<string, number>;
}

/**
 * Build month/year filter for PayrollRun queries.
 * Handles same-year and cross-year date ranges.
 */
function buildPayrollRunDateFilter(dateFrom: Date, dateTo: Date): Record<string, unknown> {
  const startMonth = dateFrom.getMonth() + 1;
  const startYear = dateFrom.getFullYear();
  const endMonth = dateTo.getMonth() + 1;
  const endYear = dateTo.getFullYear();

  if (startYear === endYear) {
    return { year: startYear, month: { gte: startMonth, lte: endMonth } };
  }

  // Cross-year: use OR conditions
  const conditions: Record<string, unknown>[] = [
    { year: startYear, month: { gte: startMonth } },
  ];

  // Middle years (all months)
  for (let y = startYear + 1; y < endYear; y++) {
    conditions.push({ year: y });
  }

  conditions.push({ year: endYear, month: { lte: endMonth } });

  return { OR: conditions };
}

// ═══════════════════════════════════════════════════════════════
// R11: Salary Register (5 sheets!)
// ═══════════════════════════════════════════════════════════════
export async function generateSalaryRegister(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  // Find payroll runs in the date range
  const payrollRuns = await tenantDb.payrollRun.findMany({
    where: {
      companyId: scope.companyId,
      status: { in: ['APPROVED', 'DISBURSED'] },
      ...buildPayrollRunDateFilter(dateFrom, dateTo),
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const runIds = payrollRuns.map((r: any) => r.id);

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: runIds },
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
          bankAccountNumber: true,
          bankName: true,
          bankIfscCode: true,
          panNumber: true,
          uan: true,
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  // Collect all unique earning and deduction component codes
  const earningKeys = new Set<string>();
  const deductionKeys = new Set<string>();
  for (const entry of entries) {
    for (const k of Object.keys(jsonObj(entry.earnings))) earningKeys.add(k);
    for (const k of Object.keys(jsonObj(entry.deductions))) deductionKeys.add(k);
  }
  const earningCodes = Array.from(earningKeys).sort();
  const deductionCodes = Array.from(deductionKeys).sort();

  // ── Summary Sheet ──
  const deptSummary: Record<string, { count: number; gross: number; deductions: number; net: number }> = {};
  for (const entry of entries) {
    const dept = entry.employee?.department?.name ?? 'Unassigned';
    if (!deptSummary[dept]) deptSummary[dept] = { count: 0, gross: 0, deductions: 0, net: 0 };
    deptSummary[dept].count++;
    deptSummary[dept].gross += dec(entry.grossEarnings);
    deptSummary[dept].deductions += dec(entry.totalDeductions);
    deptSummary[dept].net += dec(entry.netPay);
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Employees', key: 'count', width: 12, format: 'number' },
      { header: 'Gross Earnings', key: 'gross', width: 18, format: 'currency' },
      { header: 'Total Deductions', key: 'deductions', width: 18, format: 'currency' },
      { header: 'Net Pay', key: 'net', width: 18, format: 'currency' },
    ],
    rows: Object.entries(deptSummary)
      .sort((a, b) => b[1].net - a[1].net)
      .map(([dept, data]) => ({ department: dept, ...data })),
    totalsRow: {
      department: 'Total',
      count: entries.length,
      gross: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      deductions: entries.reduce((s: number, e: any) => s + dec(e.totalDeductions), 0),
      net: entries.reduce((s: number, e: any) => s + dec(e.netPay), 0),
    },
  };

  // ── Earnings Sheet (component-wise breakup) ──
  const earningsColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Month', key: 'month', width: 12 },
    ...earningCodes.map((code) => ({
      header: code,
      key: `earn_${code}`,
      width: 14,
      format: 'currency' as const,
    })),
    { header: 'Gross Earnings', key: 'gross', width: 18, format: 'currency' },
  ];

  const earningsRows = entries.map((e: any) => {
    const row: Record<string, unknown> = {
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
    };
    const earnings = jsonObj(e.earnings);
    for (const code of earningCodes) {
      row[`earn_${code}`] = dec(earnings[code]);
    }
    row.gross = dec(e.grossEarnings);
    return row;
  });

  const earningsSheet: ReportSheet = {
    name: 'Earnings',
    columns: earningsColumns,
    rows: earningsRows,
  };

  // ── Deductions Sheet ──
  const deductionColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Month', key: 'month', width: 12 },
    ...deductionCodes.map((code) => ({
      header: code,
      key: `ded_${code}`,
      width: 14,
      format: 'currency' as const,
    })),
    { header: 'Total Deductions', key: 'totalDed', width: 18, format: 'currency' },
  ];

  const deductionRows = entries.map((e: any) => {
    const row: Record<string, unknown> = {
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
    };
    const deductions = jsonObj(e.deductions);
    for (const code of deductionCodes) {
      row[`ded_${code}`] = dec(deductions[code]);
    }
    row.totalDed = dec(e.totalDeductions);
    return row;
  });

  const deductionsSheet: ReportSheet = {
    name: 'Deductions',
    columns: deductionColumns,
    rows: deductionRows,
  };

  // ── Net Pay Sheet ──
  const netPaySheet: ReportSheet = {
    name: 'Net Pay',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Working Days', key: 'workingDays', width: 14, format: 'number' },
      { header: 'Present Days', key: 'presentDays', width: 14, format: 'number' },
      { header: 'LOP Days', key: 'lopDays', width: 12, format: 'number' },
      { header: 'Gross Earnings', key: 'gross', width: 16, format: 'currency' },
      { header: 'Total Deductions', key: 'deductions', width: 16, format: 'currency' },
      { header: 'Net Pay', key: 'netPay', width: 16, format: 'currency' },
    ],
    rows: entries.map((e: any) => ({
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
      workingDays: dec(e.workingDays),
      presentDays: dec(e.presentDays),
      lopDays: dec(e.lopDays),
      gross: dec(e.grossEarnings),
      deductions: dec(e.totalDeductions),
      netPay: dec(e.netPay),
    })),
    totalsRow: {
      empId: 'Total',
      name: '',
      department: '',
      month: '',
      workingDays: '',
      presentDays: '',
      lopDays: '',
      gross: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      deductions: entries.reduce((s: number, e: any) => s + dec(e.totalDeductions), 0),
      netPay: entries.reduce((s: number, e: any) => s + dec(e.netPay), 0),
    },
  };

  // ── Employer Cost Sheet ──
  const employerCostSheet: ReportSheet = {
    name: 'Employer Cost',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Gross Earnings', key: 'gross', width: 16, format: 'currency' },
      { header: 'PF (Employer)', key: 'pfEmployer', width: 16, format: 'currency' },
      { header: 'ESI (Employer)', key: 'esiEmployer', width: 16, format: 'currency' },
      { header: 'OT Amount', key: 'otAmount', width: 14, format: 'currency' },
      { header: 'Total CTC (Monthly)', key: 'totalCtc', width: 18, format: 'currency' },
    ],
    rows: entries.map((e: any) => ({
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
      gross: dec(e.grossEarnings),
      pfEmployer: dec(e.pfEmployer),
      esiEmployer: dec(e.esiEmployer),
      otAmount: dec(e.overtimeAmount),
      totalCtc: dec(e.grossEarnings) + dec(e.pfEmployer) + dec(e.esiEmployer),
    })),
    totalsRow: {
      empId: 'Total',
      name: '',
      department: '',
      month: '',
      gross: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      pfEmployer: entries.reduce((s: number, e: any) => s + dec(e.pfEmployer), 0),
      esiEmployer: entries.reduce((s: number, e: any) => s + dec(e.esiEmployer), 0),
      otAmount: entries.reduce((s: number, e: any) => s + dec(e.overtimeAmount), 0),
      totalCtc: entries.reduce(
        (s: number, e: any) => s + dec(e.grossEarnings) + dec(e.pfEmployer) + dec(e.esiEmployer),
        0,
      ),
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Salary Register',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, earningsSheet, deductionsSheet, netPaySheet, employerCostSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R12: Bank Transfer File (NEFT format, plain)
// ═══════════════════════════════════════════════════════════════
export async function generateBankTransferFile(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  const payrollRuns = await tenantDb.payrollRun.findMany({
    where: {
      companyId: scope.companyId,
      status: { in: ['APPROVED', 'DISBURSED'] },
      ...buildPayrollRunDateFilter(dateFrom, dateTo),
    },
  });

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: payrollRuns.map((r: any) => r.id) },
      ...(scope.employeeIds?.length ? { employeeId: { in: scope.employeeIds } } : {}),
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          bankAccountNumber: true,
          bankIfscCode: true,
          bankName: true,
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  const neftSheet: ReportSheet = {
    name: 'NEFT Transfer',
    columns: [
      { header: 'Sr No', key: 'srNo', width: 8, format: 'number' },
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Bank Name', key: 'bankName', width: 22 },
      { header: 'Account Number', key: 'accountNumber', width: 22 },
      { header: 'IFSC Code', key: 'ifscCode', width: 14 },
      { header: 'Net Pay', key: 'netPay', width: 16, format: 'currency' },
      { header: 'Month/Year', key: 'period', width: 14 },
    ],
    rows: entries.map((e: any, idx: number) => ({
      srNo: idx + 1,
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      bankName: e.employee?.bankName ?? '',
      accountNumber: e.employee?.bankAccountNumber ?? '',
      ifscCode: e.employee?.bankIfscCode ?? '',
      netPay: dec(e.netPay),
      period: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
    })),
    totalsRow: {
      srNo: '',
      empId: 'Total',
      name: `${entries.length} employees`,
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      netPay: entries.reduce((s: number, e: any) => s + dec(e.netPay), 0),
      period: '',
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Bank Transfer File',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [neftSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R13: CTC Distribution Report
// ═══════════════════════════════════════════════════════════════
export async function generateCTCDistributionReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    status: { notIn: ['EXITED'] },
    annualCtc: { not: null },
  };
  if (scope.departmentIds?.length) where.departmentId = { in: scope.departmentIds };
  if (filters.departmentId) where.departmentId = filters.departmentId;

  const employees = await tenantDb.employee.findMany({
    where,
    select: {
      employeeId: true,
      firstName: true,
      lastName: true,
      annualCtc: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      grade: { select: { name: true } },
    },
    orderBy: { annualCtc: 'desc' },
  });

  const totalCtc = employees.reduce((s: number, e: any) => s + dec(e.annualCtc), 0);

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20, format: 'currency' },
    ],
    rows: [
      { metric: 'Total Headcount', value: employees.length },
      { metric: 'Total Annual CTC', value: totalCtc },
      { metric: 'Average CTC', value: employees.length > 0 ? Math.round(totalCtc / employees.length) : 0 },
      { metric: 'Median CTC', value: employees.length > 0 ? dec(employees[Math.floor(employees.length / 2)]?.annualCtc) : 0 },
      { metric: 'Highest CTC', value: employees.length > 0 ? dec(employees[0]?.annualCtc) : 0 },
      { metric: 'Lowest CTC', value: employees.length > 0 ? dec(employees[employees.length - 1]?.annualCtc) : 0 },
    ],
  };

  // ── By Grade Sheet ──
  const gradeMap: Record<string, { count: number; totalCtc: number; minCtc: number; maxCtc: number }> = {};
  for (const emp of employees) {
    const grade = emp.grade?.name ?? 'Ungraded';
    const ctc = dec(emp.annualCtc);
    if (!gradeMap[grade]) gradeMap[grade] = { count: 0, totalCtc: 0, minCtc: Infinity, maxCtc: 0 };
    gradeMap[grade].count++;
    gradeMap[grade].totalCtc += ctc;
    if (ctc < gradeMap[grade].minCtc) gradeMap[grade].minCtc = ctc;
    if (ctc > gradeMap[grade].maxCtc) gradeMap[grade].maxCtc = ctc;
  }

  const gradeSheet: ReportSheet = {
    name: 'By Grade',
    columns: [
      { header: 'Grade', key: 'grade', width: 20 },
      { header: 'Headcount', key: 'count', width: 12, format: 'number' },
      { header: 'Total CTC', key: 'totalCtc', width: 18, format: 'currency' },
      { header: 'Avg CTC', key: 'avgCtc', width: 16, format: 'currency' },
      { header: 'Min CTC', key: 'minCtc', width: 16, format: 'currency' },
      { header: 'Max CTC', key: 'maxCtc', width: 16, format: 'currency' },
    ],
    rows: Object.entries(gradeMap)
      .sort((a, b) => b[1].totalCtc - a[1].totalCtc)
      .map(([grade, data]) => ({
        grade,
        count: data.count,
        totalCtc: data.totalCtc,
        avgCtc: data.count > 0 ? Math.round(data.totalCtc / data.count) : 0,
        minCtc: data.minCtc === Infinity ? 0 : data.minCtc,
        maxCtc: data.maxCtc,
      })),
  };

  // ── By Department Sheet ──
  const deptMap: Record<string, { count: number; totalCtc: number }> = {};
  for (const emp of employees) {
    const dept = emp.department?.name ?? 'Unassigned';
    if (!deptMap[dept]) deptMap[dept] = { count: 0, totalCtc: 0 };
    deptMap[dept].count++;
    deptMap[dept].totalCtc += dec(emp.annualCtc);
  }

  const deptSheet: ReportSheet = {
    name: 'By Department',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Headcount', key: 'count', width: 12, format: 'number' },
      { header: 'Total CTC', key: 'totalCtc', width: 18, format: 'currency' },
      { header: 'Avg CTC', key: 'avgCtc', width: 16, format: 'currency' },
      { header: '% of Total CTC', key: 'percentage', width: 16, format: 'percentage' },
    ],
    rows: Object.entries(deptMap)
      .sort((a, b) => b[1].totalCtc - a[1].totalCtc)
      .map(([dept, data]) => ({
        department: dept,
        count: data.count,
        totalCtc: data.totalCtc,
        avgCtc: data.count > 0 ? Math.round(data.totalCtc / data.count) : 0,
        percentage: totalCtc > 0 ? data.totalCtc / totalCtc : 0,
      })),
  };

  // ── CTC Bands Sheet ──
  const bands = [
    { label: '< 3L', min: 0, max: 300000 },
    { label: '3L - 5L', min: 300000, max: 500000 },
    { label: '5L - 8L', min: 500000, max: 800000 },
    { label: '8L - 12L', min: 800000, max: 1200000 },
    { label: '12L - 18L', min: 1200000, max: 1800000 },
    { label: '18L - 25L', min: 1800000, max: 2500000 },
    { label: '25L - 40L', min: 2500000, max: 4000000 },
    { label: '40L - 60L', min: 4000000, max: 6000000 },
    { label: '60L+', min: 6000000, max: Infinity },
  ];

  const bandCounts = bands.map((band) => {
    const count = employees.filter((e: any) => {
      const ctc = dec(e.annualCtc);
      return ctc >= band.min && ctc < band.max;
    }).length;
    return {
      band: band.label,
      count,
      percentage: employees.length > 0 ? count / employees.length : 0,
    };
  });

  const bandSheet: ReportSheet = {
    name: 'CTC Bands',
    columns: [
      { header: 'CTC Band', key: 'band', width: 18 },
      { header: 'Headcount', key: 'count', width: 14, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 14, format: 'percentage' },
    ],
    rows: bandCounts,
    totalsRow: { band: 'Total', count: employees.length, percentage: 1 },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'CTC Distribution Report',
    period: `As of ${formatDate(new Date())}`,
    sheets: [summarySheet, gradeSheet, deptSheet, bandSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R14: Salary Revision Report
// ═══════════════════════════════════════════════════════════════
export async function generateSalaryRevisionReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  const revisions = await tenantDb.salaryRevision.findMany({
    where: {
      companyId: scope.companyId,
      effectiveDate: { gte: dateFrom, lte: dateTo },
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          grade: { select: { name: true } },
        },
      },
    },
    orderBy: { effectiveDate: 'desc' },
  });

  // ── Summary Sheet ──
  const totalOld = revisions.reduce((s: number, r: any) => s + dec(r.oldCtc), 0);
  const totalNew = revisions.reduce((s: number, r: any) => s + dec(r.newCtc), 0);
  const avgIncrement =
    revisions.length > 0
      ? revisions.reduce((s: number, r: any) => s + dec(r.incrementPercent), 0) / revisions.length
      : 0;

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: [
      { metric: 'Total Revisions', value: revisions.length },
      { metric: 'Total Old CTC', value: totalOld },
      { metric: 'Total New CTC', value: totalNew },
      { metric: 'Total Increment (annual)', value: totalNew - totalOld },
      { metric: 'Average Increment %', value: `${avgIncrement.toFixed(1)}%` },
      { metric: 'Total Arrears', value: revisions.reduce((s: number, r: any) => s + dec(r.totalArrears), 0) },
    ],
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Grade', key: 'grade', width: 12 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, format: 'date' },
      { header: 'Old CTC', key: 'oldCtc', width: 16, format: 'currency' },
      { header: 'New CTC', key: 'newCtc', width: 16, format: 'currency' },
      { header: 'Increment', key: 'increment', width: 16, format: 'currency', conditionalFormat: 'green-if-positive' },
      { header: 'Increment %', key: 'incrementPercent', width: 14, format: 'percentage' },
      { header: 'Arrears', key: 'arrears', width: 14, format: 'currency' },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
    ],
    rows: revisions.map((r: any) => ({
      empId: r.employee?.employeeId ?? '',
      name: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '',
      department: r.employee?.department?.name ?? '',
      grade: r.employee?.grade?.name ?? '',
      effectiveDate: formatDate(r.effectiveDate),
      oldCtc: dec(r.oldCtc),
      newCtc: dec(r.newCtc),
      increment: dec(r.newCtc) - dec(r.oldCtc),
      incrementPercent: dec(r.incrementPercent) / 100,
      arrears: dec(r.totalArrears),
      status: r.status,
    })),
    totalsRow: {
      empId: 'Total',
      name: `${revisions.length} revisions`,
      department: '',
      grade: '',
      effectiveDate: '',
      oldCtc: totalOld,
      newCtc: totalNew,
      increment: totalNew - totalOld,
      incrementPercent: '',
      arrears: revisions.reduce((s: number, r: any) => s + dec(r.totalArrears), 0),
      status: '',
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Salary Revision Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, detailSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R15: Loan Outstanding Report
// ═══════════════════════════════════════════════════════════════
export async function generateLoanOutstandingReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const loans = await tenantDb.loanRecord.findMany({
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
        },
      },
      policy: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { outstanding: 'desc' }],
  });

  const activeLoans = loans.filter((l: any) => l.status === 'ACTIVE' || l.status === 'DISBURSED');
  const totalOutstanding = activeLoans.reduce((s: number, l: any) => s + dec(l.outstanding), 0);
  const totalDisbursed = activeLoans.reduce((s: number, l: any) => s + dec(l.amount), 0);

  // ── Summary Sheet ──
  const typeSummary: Record<string, { count: number; disbursed: number; outstanding: number }> = {};
  for (const loan of activeLoans) {
    const type = loan.loanType ?? 'OTHER';
    if (!typeSummary[type]) typeSummary[type] = { count: 0, disbursed: 0, outstanding: 0 };
    typeSummary[type].count++;
    typeSummary[type].disbursed += dec(loan.amount);
    typeSummary[type].outstanding += dec(loan.outstanding);
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Loan Type', key: 'loanType', width: 22 },
      { header: 'Active Loans', key: 'count', width: 14, format: 'number' },
      { header: 'Total Disbursed', key: 'disbursed', width: 18, format: 'currency' },
      { header: 'Total Outstanding', key: 'outstanding', width: 18, format: 'currency' },
      { header: 'Recovery %', key: 'recoveryPct', width: 14, format: 'percentage' },
    ],
    rows: Object.entries(typeSummary).map(([type, data]) => ({
      loanType: type,
      ...data,
      recoveryPct: data.disbursed > 0 ? (data.disbursed - data.outstanding) / data.disbursed : 0,
    })),
    totalsRow: {
      loanType: 'Total',
      count: activeLoans.length,
      disbursed: totalDisbursed,
      outstanding: totalOutstanding,
      recoveryPct: totalDisbursed > 0 ? (totalDisbursed - totalOutstanding) / totalDisbursed : 0,
    },
  };

  // ── Active Loans Sheet ──
  const activeSheet: ReportSheet = {
    name: 'Active Loans',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Loan Type', key: 'loanType', width: 16 },
      { header: 'Policy', key: 'policy', width: 18 },
      { header: 'Disbursed Amt', key: 'amount', width: 16, format: 'currency' },
      { header: 'Outstanding', key: 'outstanding', width: 16, format: 'currency' },
      { header: 'EMI Amount', key: 'emiAmount', width: 14, format: 'currency' },
      { header: 'Tenure (months)', key: 'tenure', width: 16, format: 'number' },
      { header: 'Interest Rate', key: 'interestRate', width: 14, format: 'percentage' },
      { header: 'Disbursed Date', key: 'disbursedAt', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 12, conditionalFormat: 'status' },
    ],
    rows: activeLoans.map((l: any) => ({
      empId: l.employee?.employeeId ?? '',
      name: l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '',
      department: l.employee?.department?.name ?? '',
      loanType: l.loanType,
      policy: l.policy?.name ?? '',
      amount: dec(l.amount),
      outstanding: dec(l.outstanding),
      emiAmount: dec(l.emiAmount),
      tenure: l.tenure,
      interestRate: dec(l.interestRate) / 100,
      disbursedAt: formatDate(l.disbursedAt),
      status: l.status,
    })),
    totalsRow: {
      empId: 'Total',
      name: `${activeLoans.length} loans`,
      department: '',
      loanType: '',
      policy: '',
      amount: totalDisbursed,
      outstanding: totalOutstanding,
      emiAmount: activeLoans.reduce((s: number, l: any) => s + dec(l.emiAmount), 0),
      tenure: '',
      interestRate: '',
      disbursedAt: '',
      status: '',
    },
  };

  // ── EMI Schedule Sheet (remaining months for active loans) ──
  const emiRows: Record<string, unknown>[] = [];
  for (const loan of activeLoans) {
    const emi = dec(loan.emiAmount);
    let remaining = dec(loan.outstanding);
    let monthNum = 1;
    while (remaining > 0 && monthNum <= 120) {
      const principal = Math.min(emi, remaining);
      emiRows.push({
        empId: loan.employee?.employeeId ?? '',
        name: loan.employee ? `${loan.employee.firstName} ${loan.employee.lastName}` : '',
        loanType: loan.loanType,
        monthNum,
        emiAmount: Math.min(emi, remaining + (remaining * dec(loan.interestRate)) / 100 / 12),
        openingBalance: remaining,
        closingBalance: Math.max(0, remaining - principal),
      });
      remaining -= principal;
      monthNum++;
    }
  }

  const emiSheet: ReportSheet = {
    name: 'EMI Schedule',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Loan Type', key: 'loanType', width: 16 },
      { header: 'Month #', key: 'monthNum', width: 10, format: 'number' },
      { header: 'EMI Amount', key: 'emiAmount', width: 14, format: 'currency' },
      { header: 'Opening Balance', key: 'openingBalance', width: 16, format: 'currency' },
      { header: 'Closing Balance', key: 'closingBalance', width: 16, format: 'currency' },
    ],
    rows: emiRows,
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Loan Outstanding Report',
    period: `As of ${formatDate(new Date())}`,
    sheets: [summarySheet, activeSheet, emiSheet],
  });
}
