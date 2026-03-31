// ─── Workforce Reports: R01 Employee Master, R02 Headcount Movement, R03 Demographics ───
import { generateExcelReport, type ReportConfig, type ReportSheet, type SheetColumn } from '../excel-exporter';
import type { DashboardFilters, DataScope } from '../../analytics.types';

// ─── Helpers ───
function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dec(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

function buildWhereClause(filters: DashboardFilters, scope: DataScope) {
  const where: Record<string, unknown> = { companyId: scope.companyId };
  if (scope.departmentIds?.length) where.departmentId = { in: scope.departmentIds };
  if (scope.locationIds?.length) where.locationId = { in: scope.locationIds };
  if (scope.employeeIds?.length) where.id = { in: scope.employeeIds };
  if (filters.gradeId) where.gradeId = filters.gradeId;
  if (filters.employeeTypeId) where.employeeTypeId = filters.employeeTypeId;
  if (filters.departmentId) where.departmentId = filters.departmentId;
  if (filters.locationId) where.locationId = filters.locationId;
  return where;
}

// ═══════════════════════════════════════════════════════════════
// R01: Employee Master Report
// ═══════════════════════════════════════════════════════════════
export async function generateEmployeeMasterReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildWhereClause(filters, scope);

  const employees = await tenantDb.employee.findMany({
    where,
    include: {
      department: { select: { name: true } },
      designation: { select: { name: true } },
      grade: { select: { name: true } },
      employeeType: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
  });

  // ── Summary Sheet: counts by status and department ──
  const statusCounts: Record<string, number> = {};
  const deptCounts: Record<string, number> = {};

  for (const emp of employees) {
    statusCounts[emp.status] = (statusCounts[emp.status] ?? 0) + 1;
    const deptName = emp.department?.name ?? 'Unassigned';
    deptCounts[deptName] = (deptCounts[deptName] ?? 0) + 1;
  }

  const summaryColumns: SheetColumn[] = [
    { header: 'Category', key: 'category', width: 25 },
    { header: 'Value', key: 'value', width: 20 },
    { header: 'Count', key: 'count', width: 15, format: 'number' },
    { header: '% of Total', key: 'percentage', width: 15, format: 'percentage' },
  ];

  const summaryRows: Record<string, unknown>[] = [];
  const total = employees.length;

  // Status section
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    summaryRows.push({
      category: 'By Status',
      value: status,
      count,
      percentage: total > 0 ? count / total : 0,
    });
  }
  // Department section
  for (const [dept, count] of Object.entries(deptCounts).sort((a, b) => b[1] - a[1])) {
    summaryRows.push({
      category: 'By Department',
      value: dept,
      count,
      percentage: total > 0 ? count / total : 0,
    });
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: summaryColumns,
    rows: summaryRows,
    totalsRow: { category: 'Total', value: '', count: total, percentage: 1 },
  };

  // ── Detail Sheet: all employee fields ──
  const detailColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'employeeId', width: 14 },
    { header: 'First Name', key: 'firstName', width: 15 },
    { header: 'Last Name', key: 'lastName', width: 15 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Date of Birth', key: 'dateOfBirth', width: 14, format: 'date' },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Designation', key: 'designation', width: 20 },
    { header: 'Grade', key: 'grade', width: 12 },
    { header: 'Employee Type', key: 'employeeType', width: 16 },
    { header: 'Location', key: 'location', width: 18 },
    { header: 'Joining Date', key: 'joiningDate', width: 14, format: 'date' },
    { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
    { header: 'Annual CTC', key: 'annualCtc', width: 16, format: 'currency' },
    { header: 'Mobile', key: 'personalMobile', width: 15 },
    { header: 'Email', key: 'personalEmail', width: 25 },
    { header: 'PAN', key: 'panNumber', width: 14 },
    { header: 'Aadhaar', key: 'aadhaarNumber', width: 16 },
    { header: 'UAN', key: 'uan', width: 16 },
  ];

  const detailRows = employees.map((emp: any) => ({
    employeeId: emp.employeeId,
    firstName: emp.firstName,
    lastName: emp.lastName,
    gender: emp.gender,
    dateOfBirth: formatDate(emp.dateOfBirth),
    department: emp.department?.name ?? '',
    designation: emp.designation?.name ?? '',
    grade: emp.grade?.name ?? '',
    employeeType: emp.employeeType?.name ?? '',
    location: emp.location?.name ?? '',
    joiningDate: formatDate(emp.joiningDate),
    status: emp.status,
    annualCtc: dec(emp.annualCtc),
    personalMobile: emp.personalMobile,
    personalEmail: emp.personalEmail,
    panNumber: emp.panNumber ?? '',
    aadhaarNumber: emp.aadhaarNumber ?? '',
    uan: emp.uan ?? '',
  }));

  const detailSheet: ReportSheet = {
    name: 'Employee Details',
    columns: detailColumns,
    rows: detailRows,
  };

  const config: ReportConfig = {
    companyName,
    reportTitle: 'Employee Master Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, detailSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R02: Headcount Movement Report
// ═══════════════════════════════════════════════════════════════
export async function generateHeadcountMovementReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);
  const companyWhere = { companyId: scope.companyId };

  // Joiners
  const joiners = await tenantDb.employee.findMany({
    where: {
      ...companyWhere,
      joiningDate: { gte: dateFrom, lte: dateTo },
      ...(scope.departmentIds?.length ? { departmentId: { in: scope.departmentIds } } : {}),
    },
    include: {
      department: { select: { name: true } },
      designation: { select: { name: true } },
    },
    orderBy: { joiningDate: 'desc' },
  });

  // Leavers
  const leavers = await tenantDb.exitRequest.findMany({
    where: {
      ...companyWhere,
      lastWorkingDate: { gte: dateFrom, lte: dateTo },
    },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
          designation: { select: { name: true } },
        },
      },
    },
    orderBy: { lastWorkingDate: 'desc' },
  });

  // Transfers
  const transfers = await tenantDb.employeeTransfer.findMany({
    where: {
      ...companyWhere,
      effectiveDate: { gte: dateFrom, lte: dateTo },
    },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { effectiveDate: 'desc' },
  });

  // Promotions
  const promotions = await tenantDb.employeePromotion.findMany({
    where: {
      ...companyWhere,
      effectiveDate: { gte: dateFrom, lte: dateTo },
    },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { effectiveDate: 'desc' },
  });

  // ── Summary Sheet ──
  const totalActive = await tenantDb.employee.count({
    where: { ...companyWhere, status: { notIn: ['EXITED'] } },
  });

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Count', key: 'count', width: 15, format: 'number' },
    ],
    rows: [
      { metric: 'Total Active Employees (current)', count: totalActive },
      { metric: 'New Joiners (period)', count: joiners.length },
      { metric: 'Leavers (period)', count: leavers.length },
      { metric: 'Net Change', count: joiners.length - leavers.length },
      { metric: 'Transfers (period)', count: transfers.length },
      { metric: 'Promotions (period)', count: promotions.length },
    ],
  };

  // ── Joiners Sheet ──
  const joinersSheet: ReportSheet = {
    name: 'Joiners',
    columns: [
      { header: 'Emp ID', key: 'employeeId', width: 14 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Joining Date', key: 'joiningDate', width: 14, format: 'date' },
    ],
    rows: joiners.map((e: any) => ({
      employeeId: e.employeeId,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department?.name ?? '',
      designation: e.designation?.name ?? '',
      joiningDate: formatDate(e.joiningDate),
    })),
    totalsRow: { employeeId: 'Total', name: '', department: '', designation: '', joiningDate: joiners.length },
  };

  // ── Leavers Sheet ──
  const leaversSheet: ReportSheet = {
    name: 'Leavers',
    columns: [
      { header: 'Emp ID', key: 'employeeId', width: 14 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Separation Type', key: 'separationType', width: 18 },
      { header: 'Last Working Date', key: 'lastWorkingDate', width: 16, format: 'date' },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
    ],
    rows: leavers.map((ex: any) => ({
      employeeId: ex.employee?.employeeId ?? '',
      name: ex.employee ? `${ex.employee.firstName} ${ex.employee.lastName}` : '',
      department: ex.employee?.department?.name ?? '',
      separationType: ex.separationType,
      lastWorkingDate: formatDate(ex.lastWorkingDate),
      status: ex.status,
    })),
    totalsRow: {
      employeeId: 'Total',
      name: '',
      department: '',
      separationType: '',
      lastWorkingDate: leavers.length,
      status: '',
    },
  };

  // ── Transfers Sheet ──
  const transfersSheet: ReportSheet = {
    name: 'Transfers',
    columns: [
      { header: 'Emp ID', key: 'employeeId', width: 14 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'From Department', key: 'fromDepartment', width: 20 },
      { header: 'To Department', key: 'toDepartment', width: 20 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, format: 'date' },
    ],
    rows: transfers.map((t: any) => ({
      employeeId: t.employee?.employeeId ?? '',
      name: t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : '',
      fromDepartment: t.fromDepartmentName ?? t.fromDepartmentId ?? '',
      toDepartment: t.toDepartmentName ?? t.toDepartmentId ?? '',
      effectiveDate: formatDate(t.effectiveDate),
    })),
  };

  // ── Promotions Sheet ──
  const promotionsSheet: ReportSheet = {
    name: 'Promotions',
    columns: [
      { header: 'Emp ID', key: 'employeeId', width: 14 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'From Designation', key: 'fromDesignation', width: 20 },
      { header: 'To Designation', key: 'toDesignation', width: 20 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, format: 'date' },
    ],
    rows: promotions.map((p: any) => ({
      employeeId: p.employee?.employeeId ?? '',
      name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : '',
      department: p.employee?.department?.name ?? '',
      fromDesignation: p.fromDesignationName ?? p.fromDesignationId ?? '',
      toDesignation: p.toDesignationName ?? p.toDesignationId ?? '',
      effectiveDate: formatDate(p.effectiveDate),
    })),
  };

  const config: ReportConfig = {
    companyName,
    reportTitle: 'Headcount Movement Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, joinersSheet, leaversSheet, transfersSheet, promotionsSheet],
  };

  return generateExcelReport(config);
}

// ═══════════════════════════════════════════════════════════════
// R03: Demographics Report
// ═══════════════════════════════════════════════════════════════
export async function generateDemographicsReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildWhereClause(filters, scope);
  const activeWhere = { ...where, status: { notIn: ['EXITED'] } };

  const employees = await tenantDb.employee.findMany({
    where: activeWhere,
    select: {
      gender: true,
      dateOfBirth: true,
      joiningDate: true,
      department: { select: { name: true } },
    },
  });

  const now = new Date();

  // ── Gender Sheet ──
  const genderCounts: Record<string, number> = {};
  for (const emp of employees) {
    const g = emp.gender ?? 'Unknown';
    genderCounts[g] = (genderCounts[g] ?? 0) + 1;
  }

  const genderSheet: ReportSheet = {
    name: 'Gender',
    columns: [
      { header: 'Gender', key: 'gender', width: 20 },
      { header: 'Count', key: 'count', width: 15, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 15, format: 'percentage' },
    ],
    rows: Object.entries(genderCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([gender, count]) => ({
        gender,
        count,
        percentage: employees.length > 0 ? count / employees.length : 0,
      })),
    totalsRow: { gender: 'Total', count: employees.length, percentage: 1 },
  };

  // ── Age Distribution Sheet ──
  const ageBuckets: Record<string, number> = {
    '18-25': 0,
    '26-30': 0,
    '31-35': 0,
    '36-40': 0,
    '41-45': 0,
    '46-50': 0,
    '51-55': 0,
    '56-60': 0,
    '60+': 0,
  };

  for (const emp of employees) {
    if (!emp.dateOfBirth) continue;
    const age = Math.floor((now.getTime() - new Date(emp.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age <= 25) ageBuckets['18-25']!++;
    else if (age <= 30) ageBuckets['26-30']!++;
    else if (age <= 35) ageBuckets['31-35']!++;
    else if (age <= 40) ageBuckets['36-40']!++;
    else if (age <= 45) ageBuckets['41-45']!++;
    else if (age <= 50) ageBuckets['46-50']!++;
    else if (age <= 55) ageBuckets['51-55']!++;
    else if (age <= 60) ageBuckets['56-60']!++;
    else ageBuckets['60+']!++;
  }

  const ageSheet: ReportSheet = {
    name: 'Age Distribution',
    columns: [
      { header: 'Age Band', key: 'ageBand', width: 15 },
      { header: 'Count', key: 'count', width: 15, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 15, format: 'percentage' },
    ],
    rows: Object.entries(ageBuckets).map(([band, count]) => ({
      ageBand: band,
      count,
      percentage: employees.length > 0 ? count / employees.length : 0,
    })),
    totalsRow: { ageBand: 'Total', count: employees.length, percentage: 1 },
  };

  // ── Tenure Distribution Sheet ──
  const tenureBuckets: Record<string, number> = {
    '< 1 year': 0,
    '1-2 years': 0,
    '2-3 years': 0,
    '3-5 years': 0,
    '5-10 years': 0,
    '10-15 years': 0,
    '15-20 years': 0,
    '20+ years': 0,
  };

  for (const emp of employees) {
    if (!emp.joiningDate) continue;
    const years = (now.getTime() - new Date(emp.joiningDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 1) tenureBuckets['< 1 year']!++;
    else if (years < 2) tenureBuckets['1-2 years']!++;
    else if (years < 3) tenureBuckets['2-3 years']!++;
    else if (years < 5) tenureBuckets['3-5 years']!++;
    else if (years < 10) tenureBuckets['5-10 years']!++;
    else if (years < 15) tenureBuckets['10-15 years']!++;
    else if (years < 20) tenureBuckets['15-20 years']!++;
    else tenureBuckets['20+ years']!++;
  }

  const tenureSheet: ReportSheet = {
    name: 'Tenure Distribution',
    columns: [
      { header: 'Tenure Band', key: 'tenureBand', width: 18 },
      { header: 'Count', key: 'count', width: 15, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 15, format: 'percentage' },
    ],
    rows: Object.entries(tenureBuckets).map(([band, count]) => ({
      tenureBand: band,
      count,
      percentage: employees.length > 0 ? count / employees.length : 0,
    })),
    totalsRow: { tenureBand: 'Total', count: employees.length, percentage: 1 },
  };

  const config: ReportConfig = {
    companyName,
    reportTitle: 'Demographics Report',
    period: `As of ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    sheets: [genderSheet, ageSheet, tenureSheet],
  };

  return generateExcelReport(config);
}
