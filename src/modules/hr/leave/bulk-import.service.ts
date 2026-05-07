import * as ExcelJS from 'exceljs';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { ApiError } from '../../../shared/errors';
import {
  EXCEL_COLUMN_MAP,
  bulkBalanceRowSchema,
} from './bulk-import.validators';
import { mutateBalance, recalculateBalance, checkPayrollLock } from './leave-balance.helpers';
import { HEADER_FILL, HEADER_FONT, ALT_ROW_FILL } from '../analytics/exports/excel-exporter';

// ── Constants ──────────────────────────────────────────────────────────
const MAX_DATA_ROWS = 500;
const DROPDOWN_ROW_START = 3;
const DROPDOWN_ROW_END = 502; // header + example + 500

// ── Field Descriptions ─────────────────────────────────────────────────

function getFieldDescription(key: string): string {
  const descriptions: Record<string, string> = {
    employeeId: 'Employee ID (e.g., EMP-00001) — pick from the Employees reference sheet',
    leaveTypeCode: 'Leave type code (e.g., CL, SL) — pick from the Leave Types reference sheet',
    year: 'Calendar year for the balance (e.g., 2026)',
    openingBalance: 'Opening balance (days). Defaults to 0 if blank.',
    accrued: 'Accrued days. Defaults to 0 if blank.',
    taken: 'Taken days. Defaults to 0 if blank.',
    adjusted: 'Manual adjustment (+/-). Defaults to 0 if blank.',
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

export class LeaveBalanceBulkImportService {

  // ────────────────────────────────────────────────────────────────────
  // 1. Generate Template
  // ────────────────────────────────────────────────────────────────────

  async generateTemplate(companyId: string): Promise<ExcelJS.Workbook> {
    const companyRecord = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { shortName: true, name: true },
    });
    if (!companyRecord) throw ApiError.notFound('Company not found');

    // Fetch reference data in parallel
    const [employees, leaveTypes] = await Promise.all([
      platformPrisma.employee.findMany({
        where: { companyId, status: { not: 'EXITED' } },
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
        orderBy: { employeeId: 'asc' },
      }),
      platformPrisma.leaveType.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true, category: true, annualEntitlement: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = companyRecord.shortName ?? companyRecord.name;
    wb.created = new Date();

    // ── Sheet 1: Balances (input sheet) ────────────────────────────
    const balSheet = wb.addWorksheet('Balances');
    balSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    // Headers
    const headers = EXCEL_COLUMN_MAP.map((c) => c.header);
    const headerRow = balSheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 24;

    // Column widths
    EXCEL_COLUMN_MAP.forEach((col, idx) => {
      const excelCol = balSheet.getColumn(idx + 1);
      if (col.key === 'employeeId') {
        excelCol.width = 18;
      } else if (col.key === 'leaveTypeCode') {
        excelCol.width = 18;
      } else {
        excelCol.width = 16;
      }
    });

    // Example row (row 2)
    const currentYear = new Date().getFullYear();
    const exampleData: Record<string, string | number> = {
      employeeId: employees[0]?.employeeId ?? 'EMP-00001',
      leaveTypeCode: leaveTypes[0]?.code ?? 'CL',
      year: currentYear,
      openingBalance: 12,
      accrued: 0,
      taken: 0,
      adjusted: 0,
    };
    const exampleValues = EXCEL_COLUMN_MAP.map((c) => exampleData[c.key] ?? '');
    const exRow = balSheet.addRow(exampleValues);
    exRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
    });
    balSheet.getCell('A2').note = '⬅ Example row — delete before uploading';

    // Dropdown validations (rows 3-502)
    const colIndex = (key: string): number =>
      EXCEL_COLUMN_MAP.findIndex((c) => c.key === key) + 1;

    const addListValidation = (key: string, formulae: string[]): void => {
      const col = colIndex(key);
      if (col < 1 || formulae.length === 0) return;
      for (let r = DROPDOWN_ROW_START; r <= DROPDOWN_ROW_END; r++) {
        balSheet.getCell(r, col).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${formulae.join(',')}"`],
        };
      }
    };

    // Master data code dropdowns
    if (employees.length > 0) addListValidation('employeeId', employees.map((e) => e.employeeId));
    if (leaveTypes.length > 0) addListValidation('leaveTypeCode', leaveTypes.map((lt) => lt.code));

    // ── Sheet 2: Employees (reference) ─────────────────────────────
    this.addReferenceSheet(
      wb,
      'Employees',
      ['Employee ID', 'First Name', 'Last Name', 'Department'],
      employees.map((e) => [e.employeeId, e.firstName, e.lastName, e.department?.name ?? '']),
      [18, 20, 20, 24],
    );

    // ── Sheet 3: Leave Types (reference) ───────────────────────────
    this.addReferenceSheet(
      wb,
      'Leave Types',
      ['Code', 'Name', 'Category', 'Annual Entitlement'],
      leaveTypes.map((lt) => [
        lt.code,
        lt.name,
        lt.category,
        Number(lt.annualEntitlement).toString(),
      ]),
      [12, 30, 16, 20],
    );

    // ── Sheet 4: Instructions ──────────────────────────────────────
    const instrSheet = wb.addWorksheet('Instructions');
    instrSheet.columns = [
      { header: 'Column', width: 20 },
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
      'Use Employee IDs from the Employees reference sheet.',
      'Use Leave Type Codes from the Leave Types reference sheet.',
      'Year must be a 4-digit number (e.g., 2026).',
      'If a balance row already exists for the same Employee + Leave Type + Year, it will be updated (upsert).',
      'Numeric fields (Opening Balance, Accrued, Taken) must be >= 0. Adjusted can be negative.',
      'Balance is computed automatically as: Opening + Accrued - Taken + Adjusted.',
      'Maximum 500 data rows per upload.',
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

  async validateUpload(companyId: string, fileBuffer: Buffer | Uint8Array) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as any);
    } catch {
      throw ApiError.badRequest('Invalid file format. Please upload a valid .xlsx file.');
    }

    const sheet = wb.getWorksheet('Balances') ?? wb.worksheets[0];
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

    // Fetch reference data for ID resolution
    const [employees, leaveTypes] = await Promise.all([
      platformPrisma.employee.findMany({
        where: { companyId, status: { not: 'EXITED' } },
        select: { id: true, employeeId: true, firstName: true, lastName: true },
      }),
      platformPrisma.leaveType.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true },
      }),
    ]);

    // Build case-insensitive lookup maps
    const empMap = new Map(employees.map((e) => [e.employeeId.toLowerCase(), e]));
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [lt.code.toLowerCase(), lt]));

    // Cross-row duplicate tracking (employeeId + leaveTypeCode + year)
    const seenKeys = new Map<string, number[]>();

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

        // Handle Excel hyperlink objects
        if (val && typeof val === 'object' && 'text' in (val as any)) {
          const textVal = (val as any).text;
          if (typeof textVal === 'string') {
            val = textVal;
          }
        }

        if (val !== null && val !== undefined && val !== '') {
          raw[col.key] = val;
        }
      }

      // Ensure string for employeeId / leaveTypeCode
      if (raw.employeeId !== undefined) raw.employeeId = String(raw.employeeId).trim();
      if (raw.leaveTypeCode !== undefined) raw.leaveTypeCode = String(raw.leaveTypeCode).trim();

      // Parse numeric fields
      for (const numField of ['year', 'openingBalance', 'accrued', 'taken', 'adjusted']) {
        if (raw[numField] !== undefined) {
          const num = Number(raw[numField]);
          raw[numField] = isNaN(num) ? raw[numField] : num;
        }
      }

      // Validate with Zod schema
      const parsed = bulkBalanceRowSchema.safeParse(raw);
      if (!parsed.success) {
        parsed.error.errors.forEach((e) => rowErrors.push(e.message));
      }

      const validData = parsed.success ? { ...parsed.data } as Record<string, unknown> : raw;

      // Resolve employee ID
      if (validData.employeeId) {
        const emp = empMap.get(String(validData.employeeId).toLowerCase());
        if (emp) {
          validData.resolvedEmployeeId = emp.id;
          validData.employeeName = `${emp.firstName} ${emp.lastName}`;
        } else {
          rowErrors.push(`Unknown Employee ID: ${validData.employeeId}`);
        }
      }

      // Resolve leave type code
      if (validData.leaveTypeCode) {
        const lt = leaveTypeMap.get(String(validData.leaveTypeCode).toLowerCase());
        if (lt) {
          validData.resolvedLeaveTypeId = lt.id;
          validData.leaveTypeName = lt.name;
        } else {
          rowErrors.push(`Unknown Leave Type Code: ${validData.leaveTypeCode}`);
        }
      }

      // Cross-row duplicate detection
      const compositeKey = `${String(validData.employeeId).toLowerCase()}|${String(validData.leaveTypeCode).toLowerCase()}|${validData.year}`;
      const existing = seenKeys.get(compositeKey) ?? [];
      existing.push(r);
      seenKeys.set(compositeKey, existing);

      rows.push(
        rowErrors.length > 0
          ? { rowNum: r, valid: false, data: validData, errors: rowErrors }
          : { rowNum: r, valid: true, data: validData },
      );
    }

    if (rows.length === 0) throw ApiError.badRequest('No valid data rows found in the uploaded file');

    // Cross-row duplicate detection
    for (const [key, rowNums] of seenKeys) {
      if (rowNums.length > 1) {
        for (const rowNum of rowNums) {
          const row = rows.find((r) => r.rowNum === rowNum);
          if (row) {
            const [empId, ltCode, year] = key.split('|');
            const err = `Duplicate entry for Employee ${empId}, Leave Type ${ltCode}, Year ${year} in rows: ${rowNums.join(', ')}`;
            if (!row.errors) row.errors = [];
            if (!row.errors.includes(err)) row.errors.push(err);
            row.valid = false;
          }
        }
      }
    }

    const validCount = rows.filter((r) => r.valid).length;
    const errorCount = rows.filter((r) => !r.valid).length;

    logger.info(`Bulk balance import validation complete: ${validCount} valid, ${errorCount} errors out of ${rows.length} rows`);

    return {
      totalRows: rows.length,
      validCount,
      errorCount,
      rows,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // 3. Confirm Import (upsert balances with partial success)
  // ────────────────────────────────────────────────────────────────────

  async confirmImport(
    companyId: string,
    validatedRows: Record<string, unknown>[],
    userId: string,
  ) {
    const results: Array<{
      rowNum: number;
      success: boolean;
      employeeId?: string;
      leaveTypeCode?: string;
      year?: number;
      action?: 'created' | 'updated';
      error?: string;
    }> = [];

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < validatedRows.length; i++) {
      const row = validatedRows[i]!;
      const rowNum = (row.rowNum as number) ?? i + 1;

      // Skip invalid rows
      if (row.valid === false) {
        failureCount++;
        results.push({ rowNum, success: false, error: 'Skipped: validation errors' });
        continue;
      }

      // The frontend sends validated row objects with shape { rowNum, valid, data: { ... } }
      // Extract the data from either row.data (nested) or row itself (flat)
      const d = (row.data as Record<string, unknown>) ?? row;

      const employeeId = (d.resolvedEmployeeId as string) ?? (d.employeeId as string);
      const leaveTypeId = (d.resolvedLeaveTypeId as string) ?? (d.leaveTypeId as string);
      const year = d.year as number;
      const openingBalance = Number(d.openingBalance ?? 0);
      const accrued = Number(d.accrued ?? 0);
      const taken = Number(d.taken ?? 0);
      const adjusted = Number(d.adjusted ?? 0);
      const balance = recalculateBalance({ openingBalance, accrued, taken, adjusted });

      try {
        await platformPrisma.$transaction(async (tx) => {
          // Check payroll lock before upserting
          await checkPayrollLock(tx, companyId, year);

          // Check for existing balance
          const existing = await (tx as any).leaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId,
                leaveTypeId,
                year,
              },
            },
          });

          if (existing) {
            // Update via mutateBalance for ledger consistency
            await mutateBalance(
              tx as any,
              existing.id,
              existing.version,
              { openingBalance, accrued, taken, adjusted },
              {
                type: 'IMPORT',
                delta: balance - Number(existing.balance),
                changedBy: userId,
                reason: 'Bulk balance import (update)',
                source: 'IMPORT',
                includeSnapshot: true,
              },
              companyId,
            );

            results.push({
              rowNum,
              success: true,
              employeeId: (d.employeeId as string) ?? '',
              leaveTypeCode: (d.leaveTypeCode as string) ?? '',
              year,
              action: 'updated',
            });
          } else {
            // Create new balance
            const created = await (tx as any).leaveBalance.create({
              data: {
                employeeId,
                leaveTypeId,
                year,
                openingBalance,
                accrued,
                taken,
                adjusted,
                balance,
                companyId,
                version: 0,
              },
            });

            // Create IMPORT transaction record
            await (tx as any).leaveBalanceTransaction.create({
              data: {
                leaveBalanceId: created.id,
                type: 'IMPORT',
                delta: balance,
                resultingBalance: balance,
                beforeState: { openingBalance: 0, accrued: 0, taken: 0, adjusted: 0, booked: 0, balance: 0 },
                afterState: { openingBalance, accrued, taken, adjusted, booked: 0, balance },
                changedBy: userId,
                reason: 'Bulk balance import (create)',
                source: 'IMPORT',
                companyId,
              },
            });

            results.push({
              rowNum,
              success: true,
              employeeId: (d.employeeId as string) ?? '',
              leaveTypeCode: (d.leaveTypeCode as string) ?? '',
              year,
              action: 'created',
            });
          }
        });

        successCount++;
      } catch (err: any) {
        failureCount++;
        const message = err?.message ?? 'Unknown error';
        logger.warn(`Bulk balance import row ${rowNum} failed: ${message}`);
        results.push({
          rowNum,
          success: false,
          employeeId: row.employeeId as string,
          leaveTypeCode: row.leaveTypeCode as string,
          year,
          error: message,
        });
      }
    }

    logger.info(`Bulk balance import complete: ${successCount} success, ${failureCount} failures out of ${validatedRows.length} rows`);

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

export const leaveBalanceBulkImportService = new LeaveBalanceBulkImportService();
