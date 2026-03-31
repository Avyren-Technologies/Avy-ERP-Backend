// ─── Statutory Reports: R16 PF ECR, R17 ESI Challan, R18 Professional Tax,
//     R19 TDS Summary, R20 Gratuity Liability ───
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
// R16: PF ECR Report (EPFO Electronic Challan-cum-Return)
// ═══════════════════════════════════════════════════════════════
export async function generatePFECRReport(
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
      year: { gte: dateFrom.getFullYear(), lte: dateTo.getFullYear() },
    },
  });

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: payrollRuns.map((r: any) => r.id) },
      OR: [{ pfEmployee: { gt: 0 } }, { pfEmployer: { gt: 0 } }],
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          uan: true,
          department: { select: { name: true } },
          grossEarnings: true,
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  // ── ECR Format Sheet (EPFO standard format) ──
  const ecrSheet: ReportSheet = {
    name: 'ECR Format',
    columns: [
      { header: 'UAN', key: 'uan', width: 16 },
      { header: 'Member Name', key: 'name', width: 25 },
      { header: 'Gross Wages', key: 'grossWages', width: 16, format: 'currency' },
      { header: 'EPF Wages', key: 'epfWages', width: 16, format: 'currency' },
      { header: 'EPS Wages', key: 'epsWages', width: 16, format: 'currency' },
      { header: 'EDLI Wages', key: 'edliWages', width: 16, format: 'currency' },
      { header: 'EPF (Employee 12%)', key: 'epfEmployee', width: 18, format: 'currency' },
      { header: 'EPS (Employer 8.33%)', key: 'epsEmployer', width: 20, format: 'currency' },
      { header: 'EPF Diff (3.67%)', key: 'epfDiff', width: 18, format: 'currency' },
      { header: 'NCP Days', key: 'ncpDays', width: 10, format: 'number' },
      { header: 'Month', key: 'month', width: 12 },
    ],
    rows: entries.map((e: any) => {
      const pfEmployee = dec(e.pfEmployee);
      const pfEmployer = dec(e.pfEmployer);
      const grossWages = dec(e.grossEarnings);
      const epfWages = Math.min(grossWages, 15000); // PF ceiling
      const epsContrib = Math.round(epfWages * 0.0833 * 100) / 100;
      const epfDiff = pfEmployer - epsContrib;
      return {
        uan: e.employee?.uan ?? '',
        name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
        grossWages,
        epfWages,
        epsWages: epfWages,
        edliWages: epfWages,
        epfEmployee: pfEmployee,
        epsEmployer: Math.max(0, epsContrib),
        epfDiff: Math.max(0, epfDiff),
        ncpDays: dec(e.lopDays),
        month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
      };
    }),
    totalsRow: {
      uan: 'Total',
      name: `${entries.length} members`,
      grossWages: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      epfWages: entries.reduce((s: number, e: any) => s + Math.min(dec(e.grossEarnings), 15000), 0),
      epsWages: entries.reduce((s: number, e: any) => s + Math.min(dec(e.grossEarnings), 15000), 0),
      edliWages: entries.reduce((s: number, e: any) => s + Math.min(dec(e.grossEarnings), 15000), 0),
      epfEmployee: entries.reduce((s: number, e: any) => s + dec(e.pfEmployee), 0),
      epsEmployer: entries.reduce((s: number, e: any) => {
        const epfWages = Math.min(dec(e.grossEarnings), 15000);
        return s + Math.round(epfWages * 0.0833 * 100) / 100;
      }, 0),
      epfDiff: '',
      ncpDays: '',
      month: '',
    },
  };

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Component', key: 'component', width: 30 },
      { header: 'Amount', key: 'amount', width: 18, format: 'currency' },
    ],
    rows: [
      { component: 'Total Members', amount: entries.length },
      { component: 'EPF Employee (12%)', amount: entries.reduce((s: number, e: any) => s + dec(e.pfEmployee), 0) },
      { component: 'EPF Employer (3.67%)', amount: entries.reduce((s: number, e: any) => {
        const epfWages = Math.min(dec(e.grossEarnings), 15000);
        return s + dec(e.pfEmployer) - Math.round(epfWages * 0.0833 * 100) / 100;
      }, 0) },
      { component: 'EPS Employer (8.33%)', amount: entries.reduce((s: number, e: any) => {
        const epfWages = Math.min(dec(e.grossEarnings), 15000);
        return s + Math.round(epfWages * 0.0833 * 100) / 100;
      }, 0) },
      { component: 'Total PF Contribution', amount: entries.reduce((s: number, e: any) => s + dec(e.pfEmployee) + dec(e.pfEmployer), 0) },
    ],
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'PF ECR Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [ecrSheet, summarySheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R17: ESI Challan Report
// ═══════════════════════════════════════════════════════════════
export async function generateESIChallanReport(
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
      year: { gte: dateFrom.getFullYear(), lte: dateTo.getFullYear() },
    },
  });

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: payrollRuns.map((r: any) => r.id) },
      OR: [{ esiEmployee: { gt: 0 } }, { esiEmployer: { gt: 0 } }],
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          esiIpNumber: true,
          department: { select: { name: true } },
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  // ── Challan Format Sheet ──
  const challanSheet: ReportSheet = {
    name: 'Challan Format',
    columns: [
      { header: 'ESI IP Number', key: 'ipNumber', width: 18 },
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Gross Wages', key: 'grossWages', width: 16, format: 'currency' },
      { header: 'Days Worked', key: 'daysWorked', width: 14, format: 'number' },
      { header: 'ESI Employee (0.75%)', key: 'esiEmployee', width: 20, format: 'currency' },
      { header: 'ESI Employer (3.25%)', key: 'esiEmployer', width: 20, format: 'currency' },
      { header: 'Total ESI', key: 'totalEsi', width: 16, format: 'currency' },
      { header: 'Month', key: 'month', width: 12 },
    ],
    rows: entries.map((e: any) => ({
      ipNumber: e.employee?.esiIpNumber ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      grossWages: dec(e.grossEarnings),
      daysWorked: dec(e.presentDays),
      esiEmployee: dec(e.esiEmployee),
      esiEmployer: dec(e.esiEmployer),
      totalEsi: dec(e.esiEmployee) + dec(e.esiEmployer),
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
    })),
    totalsRow: {
      ipNumber: 'Total',
      name: `${entries.length} employees`,
      grossWages: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      daysWorked: '',
      esiEmployee: entries.reduce((s: number, e: any) => s + dec(e.esiEmployee), 0),
      esiEmployer: entries.reduce((s: number, e: any) => s + dec(e.esiEmployer), 0),
      totalEsi: entries.reduce((s: number, e: any) => s + dec(e.esiEmployee) + dec(e.esiEmployer), 0),
      month: '',
    },
  };

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Component', key: 'component', width: 30 },
      { header: 'Amount', key: 'amount', width: 18, format: 'currency' },
    ],
    rows: [
      { component: 'Total Covered Employees', amount: entries.length },
      { component: 'Total Gross Wages', amount: entries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0) },
      { component: 'ESI Employee (0.75%)', amount: entries.reduce((s: number, e: any) => s + dec(e.esiEmployee), 0) },
      { component: 'ESI Employer (3.25%)', amount: entries.reduce((s: number, e: any) => s + dec(e.esiEmployer), 0) },
      { component: 'Total ESI Contribution', amount: entries.reduce((s: number, e: any) => s + dec(e.esiEmployee) + dec(e.esiEmployer), 0) },
    ],
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'ESI Challan Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [challanSheet, summarySheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R18: Professional Tax Report
// ═══════════════════════════════════════════════════════════════
export async function generatePTReport(
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
      year: { gte: dateFrom.getFullYear(), lte: dateTo.getFullYear() },
    },
  });

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: payrollRuns.map((r: any) => r.id) },
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          location: { select: { name: true, state: true } },
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
    orderBy: [{ employee: { location: { state: 'asc' } } }],
  });

  // Extract PT from deductions JSON
  const ptEntries = entries
    .map((e: any) => {
      const deductions = (e.deductions && typeof e.deductions === 'object') ? e.deductions as Record<string, number> : {};
      const ptAmount = dec(deductions['PT'] ?? deductions['PROFESSIONAL_TAX'] ?? deductions['prof_tax'] ?? 0);
      return { ...e, ptAmount };
    })
    .filter((e: any) => e.ptAmount > 0);

  // ── State-wise Sheet ──
  const stateMap: Record<string, { count: number; totalPT: number }> = {};
  for (const entry of ptEntries) {
    const state = entry.employee?.location?.state ?? 'Unknown';
    if (!stateMap[state]) stateMap[state] = { count: 0, totalPT: 0 };
    stateMap[state].count++;
    stateMap[state].totalPT += entry.ptAmount;
  }

  const stateSheet: ReportSheet = {
    name: 'State-wise',
    columns: [
      { header: 'State', key: 'state', width: 25 },
      { header: 'Employees', key: 'count', width: 14, format: 'number' },
      { header: 'Total PT', key: 'totalPT', width: 16, format: 'currency' },
      { header: 'Avg PT/Employee', key: 'avgPT', width: 16, format: 'currency' },
    ],
    rows: Object.entries(stateMap)
      .sort((a, b) => b[1].totalPT - a[1].totalPT)
      .map(([state, data]) => ({
        state,
        count: data.count,
        totalPT: data.totalPT,
        avgPT: data.count > 0 ? Math.round((data.totalPT / data.count) * 100) / 100 : 0,
      })),
    totalsRow: {
      state: 'Total',
      count: ptEntries.length,
      totalPT: ptEntries.reduce((s: number, e: any) => s + e.ptAmount, 0),
      avgPT: ptEntries.length > 0 ? Math.round((ptEntries.reduce((s: number, e: any) => s + e.ptAmount, 0) / ptEntries.length) * 100) / 100 : 0,
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'State', key: 'state', width: 18 },
      { header: 'Gross Wages', key: 'grossWages', width: 16, format: 'currency' },
      { header: 'PT Amount', key: 'ptAmount', width: 14, format: 'currency' },
      { header: 'Month', key: 'month', width: 12 },
    ],
    rows: ptEntries.map((e: any) => ({
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      department: e.employee?.department?.name ?? '',
      state: e.employee?.location?.state ?? '',
      grossWages: dec(e.grossEarnings),
      ptAmount: e.ptAmount,
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
    })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Professional Tax Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [stateSheet, detailSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R19: TDS Summary Report
// ═══════════════════════════════════════════════════════════════
export async function generateTDSSummaryReport(
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
      year: { gte: dateFrom.getFullYear(), lte: dateTo.getFullYear() },
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });

  const entries = await tenantDb.payrollEntry.findMany({
    where: {
      payrollRunId: { in: payrollRuns.map((r: any) => r.id) },
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          panNumber: true,
          department: { select: { name: true } },
        },
      },
      payrollRun: { select: { month: true, year: true } },
    },
  });

  // Extract TDS from deductions
  const tdsEntries = entries.map((e: any) => {
    const deductions = (e.deductions && typeof e.deductions === 'object') ? e.deductions as Record<string, number> : {};
    const tdsAmount = dec(deductions['TDS'] ?? deductions['INCOME_TAX'] ?? deductions['income_tax'] ?? 0);
    return { ...e, tdsAmount };
  }).filter((e: any) => e.tdsAmount > 0);

  // ── Quarterly Summary Sheet ──
  const quarterMap: Record<string, { count: number; grossSalary: number; tds: number }> = {};
  for (const entry of tdsEntries) {
    const month = entry.payrollRun?.month ?? 1;
    const year = entry.payrollRun?.year ?? dateFrom.getFullYear();
    let quarter: string;
    if (month >= 4 && month <= 6) quarter = `Q1 (Apr-Jun ${year})`;
    else if (month >= 7 && month <= 9) quarter = `Q2 (Jul-Sep ${year})`;
    else if (month >= 10 && month <= 12) quarter = `Q3 (Oct-Dec ${year})`;
    else quarter = `Q4 (Jan-Mar ${year})`;

    if (!quarterMap[quarter]) quarterMap[quarter] = { count: 0, grossSalary: 0, tds: 0 };
    quarterMap[quarter].count++;
    quarterMap[quarter].grossSalary += dec(entry.grossEarnings);
    quarterMap[quarter].tds += entry.tdsAmount;
  }

  const quarterlySheet: ReportSheet = {
    name: 'Quarterly Summary',
    columns: [
      { header: 'Quarter', key: 'quarter', width: 25 },
      { header: 'Employee Count', key: 'count', width: 16, format: 'number' },
      { header: 'Gross Salary', key: 'grossSalary', width: 18, format: 'currency' },
      { header: 'TDS Deducted', key: 'tds', width: 16, format: 'currency' },
      { header: 'Effective Rate', key: 'effectiveRate', width: 16, format: 'percentage' },
    ],
    rows: Object.entries(quarterMap).map(([quarter, data]) => ({
      quarter,
      count: data.count,
      grossSalary: data.grossSalary,
      tds: data.tds,
      effectiveRate: data.grossSalary > 0 ? data.tds / data.grossSalary : 0,
    })),
    totalsRow: {
      quarter: 'Total',
      count: tdsEntries.length,
      grossSalary: tdsEntries.reduce((s: number, e: any) => s + dec(e.grossEarnings), 0),
      tds: tdsEntries.reduce((s: number, e: any) => s + e.tdsAmount, 0),
      effectiveRate: '',
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'PAN', key: 'pan', width: 14 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Gross Salary', key: 'grossSalary', width: 16, format: 'currency' },
      { header: 'TDS Amount', key: 'tds', width: 14, format: 'currency' },
    ],
    rows: tdsEntries.map((e: any) => ({
      empId: e.employee?.employeeId ?? '',
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '',
      pan: e.employee?.panNumber ?? '',
      department: e.employee?.department?.name ?? '',
      month: `${e.payrollRun?.month ?? ''}/${e.payrollRun?.year ?? ''}`,
      grossSalary: dec(e.grossEarnings),
      tds: e.tdsAmount,
    })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'TDS Summary Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [quarterlySheet, detailSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R20: Gratuity Liability Report
// ═══════════════════════════════════════════════════════════════
export async function generateGratuityLiabilityReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const employees = await tenantDb.employee.findMany({
    where: {
      companyId: scope.companyId,
      status: { notIn: ['EXITED'] },
    },
    select: {
      employeeId: true,
      firstName: true,
      lastName: true,
      joiningDate: true,
      annualCtc: true,
      department: { select: { name: true } },
      grade: { select: { name: true } },
    },
    orderBy: { joiningDate: 'asc' },
  });

  const now = new Date();
  const GRATUITY_YEAR_THRESHOLD = 4.5; // Years approaching eligibility

  // Calculate gratuity for each employee
  // Gratuity = (last drawn salary × 15 / 26) × completed years of service
  const empData = employees.map((emp: any) => {
    const yearsOfService = (now.getTime() - new Date(emp.joiningDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const monthlyBasic = dec(emp.annualCtc) / 12 * 0.4; // Assume basic = 40% of CTC
    const gratuityAmount =
      yearsOfService >= 5
        ? Math.round((monthlyBasic * 15) / 26) * Math.floor(yearsOfService)
        : 0;
    const potentialGratuity = Math.round((monthlyBasic * 15) / 26) * Math.ceil(yearsOfService);
    const isApproaching = yearsOfService >= GRATUITY_YEAR_THRESHOLD && yearsOfService < 5;

    return {
      empId: emp.employeeId,
      name: `${emp.firstName} ${emp.lastName}`,
      department: emp.department?.name ?? '',
      grade: emp.grade?.name ?? '',
      joiningDate: formatDate(emp.joiningDate),
      yearsOfService: Math.round(yearsOfService * 10) / 10,
      monthlyBasic: Math.round(monthlyBasic),
      isEligible: yearsOfService >= 5,
      isApproaching,
      gratuityAmount,
      potentialGratuity,
    };
  });

  const eligible = empData.filter((e) => e.isEligible);
  const approaching = empData.filter((e) => e.isApproaching);
  const totalLiability = eligible.reduce((s, e) => s + e.gratuityAmount, 0);
  const potentialLiability = approaching.reduce((s, e) => s + e.potentialGratuity, 0);

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: [
      { metric: 'Total Active Employees', value: employees.length },
      { metric: 'Eligible (5+ years)', value: eligible.length },
      { metric: 'Approaching Eligibility (4.5-5 years)', value: approaching.length },
      { metric: 'Not Yet Eligible', value: employees.length - eligible.length - approaching.length },
      { metric: 'Current Gratuity Liability', value: totalLiability },
      { metric: 'Potential Additional Liability (approaching)', value: potentialLiability },
      { metric: 'Total Projected Liability', value: totalLiability + potentialLiability },
    ],
  };

  // ── Detail Sheet (highlight employees approaching 4.5yr) ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Grade', key: 'grade', width: 12 },
      { header: 'Joining Date', key: 'joiningDate', width: 14, format: 'date' },
      { header: 'Years of Service', key: 'yearsOfService', width: 16, format: 'number' },
      { header: 'Monthly Basic (est)', key: 'monthlyBasic', width: 18, format: 'currency' },
      { header: 'Eligible', key: 'eligibility', width: 14, conditionalFormat: 'status' },
      { header: 'Gratuity Amount', key: 'gratuityAmount', width: 16, format: 'currency' },
    ],
    rows: empData
      .sort((a, b) => b.yearsOfService - a.yearsOfService)
      .map((e) => ({
        empId: e.empId,
        name: e.name,
        department: e.department,
        grade: e.grade,
        joiningDate: e.joiningDate,
        yearsOfService: e.yearsOfService,
        monthlyBasic: e.monthlyBasic,
        eligibility: e.isEligible ? 'ACTIVE' : e.isApproaching ? 'PENDING' : 'ABSENT',
        gratuityAmount: e.isEligible ? e.gratuityAmount : e.potentialGratuity,
      })),
    totalsRow: {
      empId: 'Total',
      name: `${employees.length} employees`,
      department: '',
      grade: '',
      joiningDate: '',
      yearsOfService: '',
      monthlyBasic: '',
      eligibility: '',
      gratuityAmount: totalLiability + potentialLiability,
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Gratuity Liability Report',
    period: `As of ${formatDate(now)}`,
    sheets: [summarySheet, detailSheet],
  });
}
