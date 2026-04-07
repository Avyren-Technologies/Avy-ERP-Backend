import * as ExcelJS from 'exceljs';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { ApiError } from '../../../shared/errors';
import {
  EXCEL_COLUMN_MAP,
  GENDER_MAP,
  MARITAL_STATUS_MAP,
  WORK_TYPE_MAP,
  PAYMENT_MODE_MAP,
  ACCOUNT_TYPE_MAP,
  YES_NO_MAP,
  bulkEmployeeRowSchema,
} from './bulk-import.validators';
import { HEADER_FILL, HEADER_FONT, ALT_ROW_FILL } from '../analytics/exports/excel-exporter';
import { employeeService } from './employee.service';

// ── Constants ──────────────────────────────────────────────────────────
const MAX_DATA_ROWS = 500;
const DROPDOWN_ROW_START = 3;
const DROPDOWN_ROW_END = 502; // header + example + 500

// ── Field Descriptions ─────────────────────────────────────────────────

function getFieldDescription(key: string): string {
  const descriptions: Record<string, string> = {
    firstName: 'Employee first name',
    middleName: 'Employee middle name (optional)',
    lastName: 'Employee last name',
    dateOfBirth: 'Date of birth in YYYY-MM-DD format',
    gender: 'Male, Female, Other, or Prefer Not to Say',
    maritalStatus: 'Single, Married, Divorced, or Widowed',
    bloodGroup: 'Blood group (e.g., A+, B-, O+)',
    fatherMotherName: 'Father or mother name',
    nationality: 'Nationality (defaults to Indian if blank)',
    personalMobile: 'Personal mobile number (min 10 digits)',
    personalEmail: 'Personal email address (must be unique)',
    officialEmail: 'Official/work email address (must be unique, required for account creation)',
    emergencyContactName: 'Emergency contact person name',
    emergencyContactRelation: 'Relationship with emergency contact (e.g., Father, Spouse)',
    emergencyContactMobile: 'Emergency contact mobile number (min 10 digits)',
    joiningDate: 'Date of joining in YYYY-MM-DD format',
    employeeTypeCode: 'Employee type code from the Employee Types reference sheet',
    departmentCode: 'Department code from the Departments reference sheet',
    designationCode: 'Designation code from the Designations reference sheet',
    gradeCode: 'Grade code from the Grades reference sheet (optional)',
    locationCode: 'Location code from the Locations reference sheet (optional)',
    shiftName: 'Shift name from the Shifts reference sheet (optional)',
    costCentreCode: 'Cost centre code from the Cost Centres reference sheet (optional)',
    reportingManagerEmpId: 'Employee ID of the reporting manager (e.g., EMP-00001)',
    workType: 'ON_SITE, REMOTE, or HYBRID',
    annualCtc: 'Annual CTC amount (numeric, no commas)',
    paymentMode: 'NEFT, IMPS, or CHEQUE',
    salaryStructureName: 'Salary structure name from the Salary Structures reference sheet (optional)',
    bankAccountNumber: 'Bank account number',
    bankIfscCode: 'Bank IFSC code',
    bankName: 'Bank name',
    accountType: 'SAVINGS or CURRENT',
    panNumber: 'PAN number (e.g., ABCDE1234F)',
    aadhaarNumber: 'Aadhaar number (12 digits)',
    uan: 'Universal Account Number for PF',
    esiIpNumber: 'ESI IP Number',
    createAccount: 'Yes or No — whether to create a login account (defaults to Yes)',
    roleName: 'Role name from the Roles reference sheet (used when creating account)',
  };
  return descriptions[key] ?? key;
}

// ── Helper: style a header row ─────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 24;
}

// ── Service ────────────────────────────────────────────────────────────

export class BulkImportService {

  // ────────────────────────────────────────────────────────────────────
  // 1. Generate Template
  // ────────────────────────────────────────────────────────────────────

  async generateTemplate(companyId: string): Promise<ExcelJS.Workbook> {
    // Fetch tenant ID for role lookup
    const companyRecord = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { shortName: true, name: true, tenant: { select: { id: true } } },
    });
    if (!companyRecord) throw ApiError.notFound('Company not found');
    const tenantId = companyRecord.tenant?.id;

    // Fetch all master data in parallel
    const [
      departments,
      designations,
      grades,
      employeeTypes,
      locations,
      companyShifts,
      costCentres,
      roles,
      salaryStructures,
    ] = await Promise.all([
      platformPrisma.department.findMany({
        where: { companyId, status: 'Active' },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.designation.findMany({
        where: { companyId, status: 'Active' },
        select: { id: true, code: true, name: true, probationDays: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.grade.findMany({
        where: { companyId, status: 'Active' },
        select: { id: true, code: true, name: true, probationMonths: true, noticeDays: true, ctcMin: true, ctcMax: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.employeeType.findMany({
        where: { companyId, status: 'Active' },
        select: { id: true, code: true, name: true, pfApplicable: true, esiApplicable: true, ptApplicable: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.location.findMany({
        where: { companyId, status: 'Active' },
        select: { id: true, code: true, name: true, city: true, state: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.companyShift.findMany({
        where: { companyId },
        select: { id: true, name: true, startTime: true, endTime: true, shiftType: true },
        orderBy: { name: 'asc' },
      }),
      platformPrisma.costCentre.findMany({
        where: { companyId },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tenantId
        ? platformPrisma.role.findMany({
            where: { tenantId, isSystem: false },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      platformPrisma.salaryStructure.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = companyRecord.shortName ?? companyRecord.name;
    wb.created = new Date();

    // ── Sheet 1: Employees (input sheet) ───────────────────────────
    const empSheet = wb.addWorksheet('Employees');
    empSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    // Headers
    const headers = EXCEL_COLUMN_MAP.map((c) => c.header);
    const headerRow = empSheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 24;

    // Column widths
    EXCEL_COLUMN_MAP.forEach((col, idx) => {
      const excelCol = empSheet.getColumn(idx + 1);
      if (col.key.toLowerCase().includes('email')) {
        excelCol.width = 28;
      } else if (col.key.toLowerCase().includes('name')) {
        excelCol.width = 20;
      } else {
        excelCol.width = 18;
      }
    });

    // Example row (row 2)
    const exampleData: Record<string, string> = {
      firstName: '(Example) Rahul',
      middleName: '',
      lastName: 'Sharma',
      dateOfBirth: '1995-06-15',
      gender: 'Male',
      maritalStatus: 'Single',
      bloodGroup: 'O+',
      fatherMotherName: 'Rajesh Sharma',
      nationality: 'Indian',
      personalMobile: '9876543210',
      personalEmail: 'rahul@example.com',
      officialEmail: 'rahul@company.com',
      emergencyContactName: 'Rajesh Sharma',
      emergencyContactRelation: 'Father',
      emergencyContactMobile: '9876543211',
      joiningDate: '2026-04-01',
      employeeTypeCode: departments.length > 0 ? (employeeTypes[0]?.code ?? 'FT') : 'FT',
      departmentCode: departments[0]?.code ?? 'IT',
      designationCode: designations[0]?.code ?? 'SE',
      gradeCode: grades[0]?.code ?? '',
      locationCode: locations[0]?.code ?? '',
      shiftName: companyShifts[0]?.name ?? '',
      costCentreCode: costCentres[0]?.code ?? '',
      reportingManagerEmpId: '',
      workType: 'ON_SITE',
      annualCtc: '600000',
      paymentMode: 'NEFT',
      salaryStructureName: salaryStructures[0]?.name ?? '',
      bankAccountNumber: '1234567890',
      bankIfscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      accountType: 'SAVINGS',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      uan: '',
      esiIpNumber: '',
      createAccount: 'Yes',
      roleName: roles[0]?.name ?? '',
    };
    const exampleValues = EXCEL_COLUMN_MAP.map((c) => exampleData[c.key] ?? '');
    const exRow = empSheet.addRow(exampleValues);
    exRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
    });
    // Note on cell A2
    empSheet.getCell('A2').note = '⬅ Example row — delete before uploading';

    // Dropdown validations (rows 3-502)
    const colIndex = (key: string): number =>
      EXCEL_COLUMN_MAP.findIndex((c) => c.key === key) + 1;

    const addListValidation = (key: string, formulae: string[]): void => {
      const col = colIndex(key);
      if (col < 1) return;
      for (let r = DROPDOWN_ROW_START; r <= DROPDOWN_ROW_END; r++) {
        empSheet.getCell(r, col).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${formulae.join(',')}"`],
        };
      }
    };

    // Static enum dropdowns
    addListValidation('gender', ['Male', 'Female', 'Other', 'Prefer Not to Say']);
    addListValidation('maritalStatus', ['Single', 'Married', 'Divorced', 'Widowed']);
    addListValidation('workType', ['ON_SITE', 'REMOTE', 'HYBRID']);
    addListValidation('paymentMode', ['NEFT', 'IMPS', 'CHEQUE']);
    addListValidation('accountType', ['SAVINGS', 'CURRENT']);
    addListValidation('createAccount', ['Yes', 'No']);

    // Master data code dropdowns
    if (employeeTypes.length > 0) addListValidation('employeeTypeCode', employeeTypes.map((e) => e.code));
    if (departments.length > 0) addListValidation('departmentCode', departments.map((d) => d.code));
    if (designations.length > 0) addListValidation('designationCode', designations.map((d) => d.code));
    if (grades.length > 0) addListValidation('gradeCode', grades.map((g) => g.code));
    if (locations.length > 0) addListValidation('locationCode', locations.map((l) => l.code));
    if (companyShifts.length > 0) addListValidation('shiftName', companyShifts.map((s) => s.name));
    if (costCentres.length > 0) addListValidation('costCentreCode', costCentres.map((c) => c.code));
    if (roles.length > 0) addListValidation('roleName', roles.map((r) => r.name));
    if (salaryStructures.length > 0) addListValidation('salaryStructureName', salaryStructures.map((s) => s.name));

    // ── Reference Sheets ───────────────────────────────────────────
    this.addReferenceSheet(wb, 'Departments', ['Code', 'Name'], departments.map((d) => [d.code, d.name]), [12, 30]);
    this.addReferenceSheet(wb, 'Designations', ['Code', 'Name', 'Probation Days'], designations.map((d) => [d.code, d.name, d.probationDays?.toString() ?? '']), [12, 30, 16]);
    this.addReferenceSheet(wb, 'Grades', ['Code', 'Name', 'Probation Months', 'Notice Days', 'CTC Min', 'CTC Max'], grades.map((g) => [g.code, g.name, g.probationMonths?.toString() ?? '', g.noticeDays?.toString() ?? '', g.ctcMin?.toString() ?? '', g.ctcMax?.toString() ?? '']), [12, 30, 18, 14, 14, 14]);
    this.addReferenceSheet(wb, 'Employee Types', ['Code', 'Name', 'PF Applicable', 'ESI Applicable', 'PT Applicable'], employeeTypes.map((e) => [e.code, e.name, e.pfApplicable ? 'Yes' : 'No', e.esiApplicable ? 'Yes' : 'No', e.ptApplicable ? 'Yes' : 'No']), [12, 30, 16, 16, 16]);
    this.addReferenceSheet(wb, 'Locations', ['Code', 'Name', 'City', 'State'], locations.map((l) => [l.code, l.name, l.city ?? '', l.state ?? '']), [12, 30, 20, 20]);
    this.addReferenceSheet(wb, 'Shifts', ['Name', 'Start Time', 'End Time', 'Type'], companyShifts.map((s) => [s.name, s.startTime, s.endTime, s.shiftType ?? '']), [24, 14, 14, 14]);
    this.addReferenceSheet(wb, 'Cost Centres', ['Code', 'Name'], costCentres.map((c) => [c.code, c.name]), [12, 30]);
    this.addReferenceSheet(wb, 'Roles', ['Name'], roles.map((r) => [r.name]), [30]);
    this.addReferenceSheet(wb, 'Salary Structures', ['Name', 'Code'], salaryStructures.map((s) => [s.name, s.code]), [30, 14]);

    // ── Instructions Sheet ─────────────────────────────────────────
    const instrSheet = wb.addWorksheet('Instructions');
    instrSheet.columns = [
      { header: 'Column', width: 30 },
      { header: 'Required', width: 12 },
      { header: 'Description', width: 60 },
    ];
    styleHeaderRow(instrSheet);

    EXCEL_COLUMN_MAP.forEach((col, idx) => {
      const row = instrSheet.addRow([col.header, col.required ? 'Yes' : 'No', getFieldDescription(col.key)]);
      if (idx % 2 === 0) {
        row.eachCell((cell) => { cell.fill = ALT_ROW_FILL; });
      }
    });

    // Notes section
    const gap = instrSheet.rowCount + 2;
    const notesHeader = instrSheet.getRow(gap);
    notesHeader.getCell(1).value = 'Notes';
    notesHeader.getCell(1).font = { bold: true, size: 13 };

    const notes = [
      'Delete the example row (row 2) before uploading.',
      'Use codes from the reference sheets for Employee Type, Department, Designation, Grade, Location, and Cost Centre.',
      'Use names from reference sheets for Shift, Role, and Salary Structure.',
      'All dates must be in YYYY-MM-DD format (e.g., 2026-04-01).',
      'Create Account defaults to Yes if left blank. Requires Official Email to be filled.',
      'Maximum 500 data rows per upload.',
      'Personal Email and Official Email must be unique across all employees.',
    ];
    notes.forEach((note, i) => {
      instrSheet.getRow(gap + 1 + i).getCell(1).value = `${i + 1}. ${note}`;
    });

    instrSheet.protect('', { selectLockedCells: true });

    return wb;
  }

  // ────────────────────────────────────────────────────────────────────
  // 2. Validate Upload
  // ────────────────────────────────────────────────────────────────────

  async validateUpload(companyId: string, fileBuffer: Buffer | Uint8Array, defaultPassword: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer as any);

    const sheet = wb.getWorksheet('Employees') ?? wb.worksheets[0];
    if (!sheet) throw ApiError.badRequest('No worksheet found in the uploaded file');

    // Build header → column-index map from row 1
    const headerMap = new Map<string, number>();
    const row1 = sheet.getRow(1);
    row1.eachCell((cell, colNumber) => {
      const val = String(cell.value ?? '').trim();
      if (val) headerMap.set(val, colNumber);
    });

    if (headerMap.size === 0) throw ApiError.badRequest('No headers found in row 1');

    // Count total data rows (skip header)
    const totalSheetRows = sheet.rowCount;
    if (totalSheetRows <= 1) throw ApiError.badRequest('No data rows found in the uploaded file');
    if (totalSheetRows > DROPDOWN_ROW_END) {
      throw ApiError.badRequest(`Too many rows. Maximum ${MAX_DATA_ROWS} data rows allowed.`);
    }

    // Fetch master data for code→ID resolution
    const companyRecord = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { tenant: { select: { id: true } } },
    });
    const tenantId = companyRecord?.tenant?.id;

    const [
      departments,
      designations,
      grades,
      employeeTypes,
      locations,
      companyShifts,
      costCentres,
      roles,
      salaryStructures,
      existingEmployees,
    ] = await Promise.all([
      platformPrisma.department.findMany({ where: { companyId, status: 'Active' }, select: { id: true, code: true } }),
      platformPrisma.designation.findMany({ where: { companyId, status: 'Active' }, select: { id: true, code: true } }),
      platformPrisma.grade.findMany({ where: { companyId, status: 'Active' }, select: { id: true, code: true } }),
      platformPrisma.employeeType.findMany({ where: { companyId, status: 'Active' }, select: { id: true, code: true } }),
      platformPrisma.location.findMany({ where: { companyId, status: 'Active' }, select: { id: true, code: true } }),
      platformPrisma.companyShift.findMany({ where: { companyId }, select: { id: true, name: true } }),
      platformPrisma.costCentre.findMany({ where: { companyId }, select: { id: true, code: true } }),
      tenantId
        ? platformPrisma.role.findMany({ where: { tenantId, isSystem: false }, select: { id: true, name: true } })
        : Promise.resolve([]),
      platformPrisma.salaryStructure.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true } }),
      platformPrisma.employee.findMany({
        where: { companyId, status: { not: 'EXITED' } },
        select: { id: true, employeeId: true, personalEmail: true, officialEmail: true },
      }),
    ]);

    // Build case-insensitive lookup maps
    const deptMap = new Map(departments.map((d) => [d.code.toLowerCase(), d.id]));
    const desigMap = new Map(designations.map((d) => [d.code.toLowerCase(), d.id]));
    const gradeMap = new Map(grades.map((g) => [g.code.toLowerCase(), g.id]));
    const empTypeMap = new Map(employeeTypes.map((e) => [e.code.toLowerCase(), e.id]));
    const locMap = new Map(locations.map((l) => [l.code.toLowerCase(), l.id]));
    const shiftMap = new Map(companyShifts.map((s) => [s.name.toLowerCase(), s.id]));
    const ccMap = new Map(costCentres.map((c) => [c.code.toLowerCase(), c.id]));
    const roleMap = new Map(roles.map((r) => [r.name.toLowerCase(), r.id]));
    const salStructMap = new Map(salaryStructures.map((s) => [s.name.toLowerCase(), s.id]));

    // Existing emails (for uniqueness check)
    const existingPersonalEmails = new Set(
      existingEmployees.filter((e) => e.personalEmail).map((e) => e.personalEmail!.toLowerCase()),
    );
    const existingOfficialEmails = new Set(
      existingEmployees.filter((e) => e.officialEmail).map((e) => e.officialEmail!.toLowerCase()),
    );
    // Existing employee IDs (for reporting manager lookup)
    const existingEmpIdMap = new Map(existingEmployees.map((e) => [e.employeeId.toLowerCase(), e.id]));

    // Cross-row duplicate tracking
    const seenPersonalEmails = new Map<string, number[]>();
    const seenOfficialEmails = new Map<string, number[]>();

    const rows: Array<{
      rowNum: number;
      valid: boolean;
      data?: Record<string, unknown>;
      errors?: string[];
    }> = [];

    // Parse each data row
    for (let r = 2; r <= sheet.rowCount; r++) {
      const sheetRow = sheet.getRow(r);

      // Skip completely empty rows
      let isEmpty = true;
      sheetRow.eachCell(() => { isEmpty = false; });
      if (isEmpty) continue;

      // Skip example row
      const firstCellVal = String(sheetRow.getCell(1).value ?? '').trim();
      if (firstCellVal.startsWith('(Example')) continue;

      const rowErrors: string[] = [];
      const raw: Record<string, unknown> = {};

      // Extract values using header map
      for (const col of EXCEL_COLUMN_MAP) {
        const colIdx = headerMap.get(col.header);
        if (!colIdx) continue;
        let val = sheetRow.getCell(colIdx).value;

        // Handle ExcelJS rich text
        if (val && typeof val === 'object' && 'richText' in (val as any)) {
          val = ((val as any).richText as Array<{ text: string }>).map((t) => t.text).join('');
        }

        // Handle Excel hyperlink objects: { text, hyperlink }
        if (val && typeof val === 'object' && 'text' in (val as any)) {
          const textVal = (val as any).text;
          if (typeof textVal === 'string') {
            val = textVal;
          }
        }

        // Convert Date objects to YYYY-MM-DD
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          val = `${y}-${m}-${d}`;
        }

        if (val !== null && val !== undefined && val !== '') {
          raw[col.key] = val;
        }
      }

      // Map human-friendly enums
      if (raw.gender) raw.gender = GENDER_MAP[String(raw.gender).toLowerCase()] ?? raw.gender;
      if (raw.maritalStatus) raw.maritalStatus = MARITAL_STATUS_MAP[String(raw.maritalStatus).toLowerCase()] ?? raw.maritalStatus;
      if (raw.workType) raw.workType = WORK_TYPE_MAP[String(raw.workType).toLowerCase()] ?? raw.workType;
      if (raw.paymentMode) raw.paymentMode = PAYMENT_MODE_MAP[String(raw.paymentMode).toLowerCase()] ?? raw.paymentMode;
      if (raw.accountType) raw.accountType = ACCOUNT_TYPE_MAP[String(raw.accountType).toLowerCase()] ?? raw.accountType;

      // Parse createAccount
      if (raw.createAccount !== undefined) {
        const mapped = YES_NO_MAP[String(raw.createAccount).toLowerCase()];
        raw.createAccount = mapped !== undefined ? mapped : true;
      } else {
        raw.createAccount = true;
      }

      // Parse annualCtc as number
      if (raw.annualCtc !== undefined) {
        const ctcNum = Number(raw.annualCtc);
        raw.annualCtc = isNaN(ctcNum) ? raw.annualCtc : ctcNum;
      }

      // Ensure string types for fields frequently auto-coerced by Excel
      if (raw.personalMobile !== undefined) raw.personalMobile = String(raw.personalMobile);
      if (raw.emergencyContactMobile !== undefined) raw.emergencyContactMobile = String(raw.emergencyContactMobile);
      if (raw.aadhaarNumber !== undefined) raw.aadhaarNumber = String(raw.aadhaarNumber);
      if (raw.personalEmail !== undefined) raw.personalEmail = String(raw.personalEmail).trim();
      if (raw.officialEmail !== undefined) raw.officialEmail = String(raw.officialEmail).trim();
      if (raw.bankAccountNumber !== undefined) raw.bankAccountNumber = String(raw.bankAccountNumber).trim();

      // Validate with Zod schema
      const parsed = bulkEmployeeRowSchema.safeParse(raw);
      if (!parsed.success) {
        parsed.error.errors.forEach((e) => rowErrors.push(e.message));
      }

      const validData = parsed.success ? { ...parsed.data } as Record<string, unknown> : raw;

      // Resolve master codes → IDs
      if (validData.employeeTypeCode) {
        const id = empTypeMap.get(String(validData.employeeTypeCode).toLowerCase());
        if (id) { validData.employeeTypeId = id; } else { rowErrors.push(`Unknown employee type code: ${validData.employeeTypeCode}`); }
      }
      if (validData.departmentCode) {
        const id = deptMap.get(String(validData.departmentCode).toLowerCase());
        if (id) { validData.departmentId = id; } else { rowErrors.push(`Unknown department code: ${validData.departmentCode}`); }
      }
      if (validData.designationCode) {
        const id = desigMap.get(String(validData.designationCode).toLowerCase());
        if (id) { validData.designationId = id; } else { rowErrors.push(`Unknown designation code: ${validData.designationCode}`); }
      }
      if (validData.gradeCode) {
        const id = gradeMap.get(String(validData.gradeCode).toLowerCase());
        if (id) { validData.gradeId = id; } else { rowErrors.push(`Unknown grade code: ${validData.gradeCode}`); }
      }
      if (validData.locationCode) {
        const id = locMap.get(String(validData.locationCode).toLowerCase());
        if (id) { validData.locationId = id; } else { rowErrors.push(`Unknown location code: ${validData.locationCode}`); }
      }
      if (validData.shiftName) {
        const id = shiftMap.get(String(validData.shiftName).toLowerCase());
        if (id) { validData.shiftId = id; } else { rowErrors.push(`Unknown shift name: ${validData.shiftName}`); }
      }
      if (validData.costCentreCode) {
        const id = ccMap.get(String(validData.costCentreCode).toLowerCase());
        if (id) { validData.costCentreId = id; } else { rowErrors.push(`Unknown cost centre code: ${validData.costCentreCode}`); }
      }
      if (validData.roleName) {
        const id = roleMap.get(String(validData.roleName).toLowerCase());
        if (id) { validData.userRole = id; } else { rowErrors.push(`Unknown role name: ${validData.roleName}`); }
      }
      if (validData.salaryStructureName) {
        const id = salStructMap.get(String(validData.salaryStructureName).toLowerCase());
        if (id) { validData.salaryStructureId = id; } else { rowErrors.push(`Unknown salary structure: ${validData.salaryStructureName}`); }
      }

      // Reporting manager lookup
      if (validData.reportingManagerEmpId) {
        const mgrId = existingEmpIdMap.get(String(validData.reportingManagerEmpId).toLowerCase());
        if (mgrId) { validData.reportingManagerId = mgrId; } else { rowErrors.push(`Unknown reporting manager employee ID: ${validData.reportingManagerEmpId}`); }
      }

      // Check createAccount requires officialEmail
      if (validData.createAccount === true && !validData.officialEmail) {
        rowErrors.push('Official Email is required when Create Account is Yes');
      }

      // Check personal email against existing DB
      if (validData.personalEmail) {
        const pe = String(validData.personalEmail).toLowerCase();
        if (existingPersonalEmails.has(pe) || existingOfficialEmails.has(pe)) {
          rowErrors.push(`Personal email "${validData.personalEmail}" already exists in the system`);
        }
        // Track for cross-row duplicate detection
        const existing = seenPersonalEmails.get(pe) ?? [];
        existing.push(r);
        seenPersonalEmails.set(pe, existing);
      }

      // Check official email against existing DB
      if (validData.officialEmail) {
        const oe = String(validData.officialEmail).toLowerCase();
        if (existingOfficialEmails.has(oe) || existingPersonalEmails.has(oe)) {
          rowErrors.push(`Official email "${validData.officialEmail}" already exists in the system`);
        }
        const existing = seenOfficialEmails.get(oe) ?? [];
        existing.push(r);
        seenOfficialEmails.set(oe, existing);
      }

      rows.push(
        rowErrors.length > 0
          ? { rowNum: r, valid: false, data: validData, errors: rowErrors }
          : { rowNum: r, valid: true, data: validData },
      );
    }

    if (rows.length === 0) throw ApiError.badRequest('No valid data rows found in the uploaded file');

    // Cross-row email duplicate detection
    for (const [email, rowNums] of seenPersonalEmails) {
      if (rowNums.length > 1) {
        for (const rowNum of rowNums) {
          const row = rows.find((r) => r.rowNum === rowNum);
          if (row) {
            const err = `Duplicate personal email "${email}" found in rows: ${rowNums.join(', ')}`;
            if (!row.errors) row.errors = [];
            if (!row.errors.includes(err)) row.errors.push(err);
            row.valid = false;
          }
        }
      }
    }
    for (const [email, rowNums] of seenOfficialEmails) {
      if (rowNums.length > 1) {
        for (const rowNum of rowNums) {
          const row = rows.find((r) => r.rowNum === rowNum);
          if (row) {
            const err = `Duplicate official email "${email}" found in rows: ${rowNums.join(', ')}`;
            if (!row.errors) row.errors = [];
            if (!row.errors.includes(err)) row.errors.push(err);
            row.valid = false;
          }
        }
      }
    }

    const validCount = rows.filter((r) => r.valid).length;
    const errorCount = rows.filter((r) => !r.valid).length;

    logger.info(`Bulk import validation complete: ${validCount} valid, ${errorCount} errors out of ${rows.length} rows`);

    return {
      totalRows: rows.length,
      validCount,
      errorCount,
      rows,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // 3. Import Rows
  // ────────────────────────────────────────────────────────────────────

  async importRows(
    companyId: string,
    validatedRows: Record<string, unknown>[],
    defaultPassword: string,
    performedBy?: string,
  ) {
    const results: Array<{
      rowNum: number;
      success: boolean;
      employeeId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      accountCreated?: boolean;
      error?: string;
    }> = [];

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < validatedRows.length; i++) {
      const row = validatedRows[i]!;
      const rowNum = (row.rowNum as number) ?? i + 1;

      try {
        const createData: Record<string, unknown> = {
          // Personal
          firstName: row.firstName,
          middleName: row.middleName,
          lastName: row.lastName,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          maritalStatus: row.maritalStatus,
          bloodGroup: row.bloodGroup,
          fatherMotherName: row.fatherMotherName,
          nationality: row.nationality ?? 'Indian',

          // Contact
          personalMobile: String(row.personalMobile),
          personalEmail: row.personalEmail,
          officialEmail: row.officialEmail,
          emergencyContactName: row.emergencyContactName,
          emergencyContactRelation: row.emergencyContactRelation,
          emergencyContactMobile: String(row.emergencyContactMobile),

          // Professional
          joiningDate: row.joiningDate,
          employeeTypeId: row.employeeTypeId,
          departmentId: row.departmentId,
          designationId: row.designationId,
          gradeId: row.gradeId,
          locationId: row.locationId,
          shiftId: row.shiftId,
          costCentreId: row.costCentreId,
          reportingManagerId: row.reportingManagerId,
          workType: row.workType,

          // Salary
          annualCtc: row.annualCtc,
          paymentMode: row.paymentMode,

          // Bank
          bankAccountNumber: row.bankAccountNumber,
          bankIfscCode: row.bankIfscCode,
          bankName: row.bankName,
          accountType: row.accountType,

          // Statutory
          panNumber: row.panNumber,
          aadhaarNumber: row.aadhaarNumber ? String(row.aadhaarNumber) : undefined,
          uan: row.uan,
          esiIpNumber: row.esiIpNumber,

          // User account
          createUserAccount: row.createAccount === true && !!row.officialEmail,
          userPassword: defaultPassword,
          userRole: row.userRole,
        };

        const employee = await employeeService.createEmployee(companyId, createData, performedBy);

        successCount++;
        results.push({
          rowNum,
          success: true,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.officialEmail ?? employee.personalEmail,
          accountCreated: !!(createData.createUserAccount),
        });
      } catch (err: any) {
        failureCount++;
        const message = err?.message ?? 'Unknown error';
        logger.warn(`Bulk import row ${rowNum} failed: ${message}`);
        results.push({
          rowNum,
          success: false,
          firstName: row.firstName as string,
          lastName: row.lastName as string,
          error: message,
        });
      }
    }

    logger.info(`Bulk import complete: ${successCount} success, ${failureCount} failures out of ${validatedRows.length} rows`);

    return {
      total: validatedRows.length,
      successCount,
      failureCount,
      results,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private addReferenceSheet(
    wb: ExcelJS.Workbook,
    sheetName: string,
    headers: string[],
    data: string[][],
    widths: number[],
  ): void {
    const sheet = wb.addWorksheet(sheetName);
    sheet.addRow(headers);
    styleHeaderRow(sheet);

    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    data.forEach((rowData, idx) => {
      const row = sheet.addRow(rowData);
      if (idx % 2 === 0) {
        row.eachCell((cell) => { cell.fill = ALT_ROW_FILL; });
      }
    });

    sheet.protect('', { selectLockedCells: true });
  }
}

export const bulkImportService = new BulkImportService();
