// ============================================================
// Bulk Company Onboarding — Service
// Generates Excel template, validates uploaded files, and
// orchestrates sequential company onboarding via tenantService.
// ============================================================

import * as ExcelJS from 'exceljs';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors';
import { HEADER_FILL, HEADER_FONT, ALT_ROW_FILL } from '../../modules/hr/analytics/exports/excel-exporter';
import { ALL_SHEET_DEFS, ColDef } from './bulk-onboard.validators';
import * as C from './bulk-onboard.constants';
import { tenantService } from './tenant.service';
import type { OnboardTenantPayload } from './tenant.types';

// ── Constants ────────────────────────────────────────────────────────
const MAX_COMPANIES = 50;
const DROPDOWN_ROW_START = 3;
const DROPDOWN_ROW_END = 102;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PIN_RE = /^\d{6}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── Types ────────────────────────────────────────────────────────────

interface ValidationError {
  sheet: string;
  field: string;
  message: string;
}

interface CompanyValidationResult {
  name: string;
  rowIndex: number;
  valid: boolean;
  payload?: OnboardTenantPayload;
  errors?: ValidationError[];
}

interface ValidateUploadResult {
  totalCompanies: number;
  validCount: number;
  errorCount: number;
  companies: CompanyValidationResult[];
}

interface ImportResult {
  name: string;
  success: boolean;
  companyId?: string;
  error?: string;
}

interface ImportCompaniesResult {
  total: number;
  successCount: number;
  failureCount: number;
  results: ImportResult[];
}

// ── Example Data (Apex Manufacturing) ────────────────────────────────

const EXAMPLE: Record<string, Record<string, string>> = {
  'Company Identity': {
    displayName: 'Apex Manufacturing', legalName: 'Apex Manufacturing Pvt. Ltd.',
    slug: 'apex-manufacturing', businessType: 'Private Limited (Pvt. Ltd.)',
    industry: 'Manufacturing', companyCode: 'APEXMA-486', shortName: 'APEX',
    incorporationDate: '2020-01-15', employees: '120', cin: 'U72900KA2020PTC312847',
    website: 'https://apex-mfg.com', emailDomain: 'apex-mfg.com', status: 'Draft',
  },
  'Statutory': {
    displayName: 'Apex Manufacturing', pan: 'AARCA5678F', tan: 'BLRA98765T',
    gstin: '29AARCA5678F1Z3', pfRegNo: 'KA/BLR/0112345/000/0001',
    esiCode: '', ptReg: '', lwfrNo: '', rocState: 'Karnataka',
  },
  'Address': {
    displayName: 'Apex Manufacturing', regLine1: '42, Industrial Layout, Phase 2',
    regLine2: 'Peenya', regCity: 'Bengaluru', regDistrict: 'Bengaluru Urban',
    regState: 'Karnataka', regCountry: 'India', regPin: '560058', regStdCode: '080',
    sameAsRegistered: 'Yes', corpLine1: '', corpLine2: '', corpCity: '',
    corpDistrict: '', corpState: '', corpCountry: '', corpPin: '', corpStdCode: '',
  },
  'Fiscal': {
    displayName: 'Apex Manufacturing', fyType: 'apr-mar', fyCustomStartMonth: '',
    fyCustomEndMonth: '', payrollFreq: 'Monthly', cutoffDay: '25th',
    disbursementDay: '1st', weekStart: 'Monday', timezone: 'IST UTC+5:30',
    workingDays: 'Monday,Tuesday,Wednesday,Thursday,Friday',
  },
  'Preferences': {
    displayName: 'Apex Manufacturing', currency: 'INR — ₹', language: 'English',
    dateFormat: 'DD/MM/YYYY', indiaCompliance: 'Yes', mobileApp: 'Yes',
    webApp: 'Yes', systemApp: 'No', bankIntegration: 'No', emailNotif: 'Yes',
  },
  'Endpoint': {
    displayName: 'Apex Manufacturing', endpointType: 'default', customBaseUrl: '',
  },
  'Strategy': {
    displayName: 'Apex Manufacturing', multiLocationMode: 'No', locationConfig: 'common',
  },
  'Locations': {
    displayName: 'Apex Manufacturing', name: 'Bengaluru HQ', code: 'BLR-HQ-001',
    facilityType: 'Head Office', status: 'Active', isHQ: 'Yes',
    gstin: '29AARCA5678F1Z3', addressLine1: '42, Industrial Layout, Phase 2',
    addressLine2: 'Peenya', city: 'Bengaluru', district: 'Bengaluru Urban',
    state: 'Karnataka', pin: '560058', contactName: 'Rahul Mehta',
    contactEmail: 'rahul@apex-mfg.com', contactPhone: '9876543210',
    geoEnabled: 'No', geoLat: '', geoLng: '', geoRadius: '',
  },
  'Modules & Pricing': {
    displayName: 'Apex Manufacturing', locationName: '',
    selectedModules: 'hr,production,security,masters', userTier: 'growth',
    customUserLimit: '', customTierPrice: '', billingType: 'monthly', trialDays: '14',
  },
  'Contacts': {
    displayName: 'Apex Manufacturing', name: 'Priya Sharma', designation: 'HR Manager',
    department: 'Human Resources', type: 'Primary', email: 'priya@apex-mfg.com',
    countryCode: '+91', mobile: '9876543210', linkedin: '',
  },
  'Shifts': {
    displayName: 'Apex Manufacturing', dayStartTime: '06:00', dayEndTime: '22:00',
    weeklyOffs: 'Sunday', shiftName: 'Morning Shift', shiftFrom: '06:00',
    shiftTo: '14:00', noShuffle: 'No',
  },
  'No Series': {
    displayName: 'Apex Manufacturing', code: 'EMP', linkedScreen: 'Employee',
    description: 'Employee Onboarding', prefix: 'EMP-', suffix: '',
    numberCount: '6', startNumber: '1',
  },
  'IOT Reasons': {
    displayName: 'Apex Manufacturing', reasonType: 'Machine Idle',
    reason: 'Material Shortage', description: 'Raw material not available',
    department: 'Production', planned: 'No', duration: '15',
  },
  'Controls': {
    displayName: 'Apex Manufacturing', ncEditMode: 'No', loadUnload: 'No',
    cycleTime: 'No', payrollLock: 'Yes', leaveCarryForward: 'Yes',
    overtimeApproval: 'No', mfa: 'No',
  },
  'Users': {
    displayName: 'Apex Manufacturing', fullName: 'Rahul Mehta',
    username: 'rahul.mehta', password: '', role: 'Company Admin',
    email: 'rahul@apex-mfg.com', mobile: '9876543210', department: 'IT',
  },
};

// ── Dropdown definitions per sheet ───────────────────────────────────

type DropdownMap = Record<string, Record<string, string[]>>;

const SHEET_DROPDOWNS: DropdownMap = {
  'Company Identity': {
    businessType: C.BUSINESS_TYPES,
    industry: C.INDUSTRIES,
    status: C.COMPANY_STATUSES,
  },
  'Statutory': {
    rocState: C.INDIAN_STATES,
  },
  'Address': {
    regState: C.INDIAN_STATES,
    corpState: C.INDIAN_STATES,
    sameAsRegistered: ['Yes', 'No'],
  },
  'Fiscal': {
    fyType: C.FY_TYPES,
    payrollFreq: C.PAYROLL_FREQUENCIES,
    weekStart: C.WEEK_STARTS,
    timezone: C.TIMEZONES,
    cutoffDay: C.CUTOFF_DAYS,
    disbursementDay: C.DISBURSEMENT_DAYS,
  },
  'Preferences': {
    currency: C.CURRENCIES,
    language: C.LANGUAGES,
    indiaCompliance: ['Yes', 'No'],
    mobileApp: ['Yes', 'No'],
    webApp: ['Yes', 'No'],
    systemApp: ['Yes', 'No'],
    bankIntegration: ['Yes', 'No'],
    emailNotif: ['Yes', 'No'],
    dateFormat: C.DATE_FORMATS,
  },
  'Endpoint': {
    endpointType: ['default', 'custom'],
  },
  'Strategy': {
    multiLocationMode: ['Yes', 'No'],
    locationConfig: ['common', 'per-location'],
  },
  'Locations': {
    facilityType: C.FACILITY_TYPES,
    isHQ: ['Yes', 'No'],
    geoEnabled: ['Yes', 'No'],
    status: C.FACILITY_STATUSES,
  },
  'Modules & Pricing': {
    userTier: C.USER_TIERS.map((t) => t.key),
    billingType: C.BILLING_TYPES.map((t) => t.key),
  },
  'Contacts': {
    type: C.CONTACT_TYPES,
  },
  'Shifts': {
    noShuffle: ['Yes', 'No'],
  },
  'No Series': {
    linkedScreen: C.NO_SERIES_SCREENS.map((s) => s.value),
  },
  'IOT Reasons': {
    reasonType: C.IOT_REASON_TYPES,
    planned: ['Yes', 'No'],
  },
  'Controls': {
    ncEditMode: ['Yes', 'No'],
    loadUnload: ['Yes', 'No'],
    cycleTime: ['Yes', 'No'],
    payrollLock: ['Yes', 'No'],
    leaveCarryForward: ['Yes', 'No'],
    overtimeApproval: ['Yes', 'No'],
    mfa: ['Yes', 'No'],
  },
  'Users': {
    role: C.USER_ROLES,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function parseYesNo(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  const mapped = C.YES_NO_MAP[String(value).toLowerCase().trim()];
  return mapped ?? false;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Get a required string field from a row record, falling back to empty string. */
function v(row: Record<string, string>, key: string): string {
  return row[key] ?? '';
}

/** Get an optional string field — returns the value or undefined (never empty string). */
function optStr(row: Record<string, string>, key: string): string | undefined {
  const val = row[key];
  return val ? val : undefined;
}

/** Parse an optional integer from a row field. */
function optInt(row: Record<string, string>, key: string): number | undefined {
  const val = row[key];
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Strip keys whose values are `undefined`. This satisfies `exactOptionalPropertyTypes`
 * because the resulting object simply omits those keys instead of having them set to `undefined`.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) result[k] = val;
  }
  return result as T;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 24;
}

function getFieldDescription(sheetName: string, key: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    'Company Identity': {
      displayName: 'Unique company name used across all sheets to link data',
      legalName: 'Full legal/registered company name',
      slug: 'URL-safe identifier (lowercase, hyphens only)',
      businessType: 'Type of business entity',
      industry: 'Primary industry sector',
      companyCode: 'Unique alphanumeric company code',
      shortName: 'Short abbreviation (optional)',
      incorporationDate: 'Date of incorporation (YYYY-MM-DD)',
      employees: 'Approximate employee count',
      cin: 'Corporate Identity Number',
      website: 'Company website URL',
      emailDomain: 'Primary email domain (e.g., company.com)',
      status: 'Initial company status',
    },
    'Statutory': {
      pan: 'PAN number (10 characters)',
      tan: 'TAN number (optional)',
      gstin: 'GST identification number (optional)',
      pfRegNo: 'PF registration number (optional)',
      esiCode: 'ESI code (optional)',
      ptReg: 'Professional tax registration (optional)',
      lwfrNo: 'Labour welfare fund number (optional)',
      rocState: 'ROC state of registration',
    },
    'Address': {
      regLine1: 'Registered address line 1',
      regLine2: 'Registered address line 2 (optional)',
      regCity: 'Registered city',
      regDistrict: 'Registered district (optional)',
      regState: 'Registered state',
      regCountry: 'Registered country',
      regPin: 'Registered PIN code (6 digits)',
      regStdCode: 'STD code (optional)',
      sameAsRegistered: 'If Yes, corporate address copies registered address',
      corpLine1: 'Corporate address line 1 (required if sameAsRegistered=No)',
      corpCity: 'Corporate city',
      corpState: 'Corporate state',
      corpCountry: 'Corporate country',
      corpPin: 'Corporate PIN code (6 digits)',
    },
    'Fiscal': {
      fyType: 'Financial year type (apr-mar or custom)',
      fyCustomStartMonth: 'Custom FY start month (required if fyType=custom)',
      fyCustomEndMonth: 'Custom FY end month (required if fyType=custom)',
      payrollFreq: 'Payroll frequency (defaults to Monthly)',
      cutoffDay: 'Payroll cutoff day',
      disbursementDay: 'Salary disbursement day',
      weekStart: 'First day of the week',
      timezone: 'Company timezone',
      workingDays: 'Comma-separated: Monday,Tuesday,Wednesday,...',
    },
    'Preferences': {
      currency: 'Currency (defaults to INR)',
      language: 'Language (defaults to English)',
      dateFormat: 'Date format',
      indiaCompliance: 'Enable India compliance features',
      mobileApp: 'Enable mobile app access',
      webApp: 'Enable web app access',
      systemApp: 'Enable system app access',
      bankIntegration: 'Enable bank integration',
      emailNotif: 'Enable email notifications',
    },
    'Endpoint': {
      endpointType: 'default or custom',
      customBaseUrl: 'Required if endpointType=custom',
    },
    'Strategy': {
      multiLocationMode: 'Enable multi-location mode',
      locationConfig: 'common (shared modules) or per-location',
    },
    'Locations': {
      name: 'Location name',
      code: 'Unique location code',
      facilityType: 'Type of facility',
      status: 'Active, Inactive, or Under Construction',
      isHQ: 'Is this the headquarters?',
      gstin: 'Location-specific GSTIN (optional)',
      addressLine1: 'Location address line 1',
      city: 'Location city',
      state: 'Location state',
      pin: 'Location PIN code',
      contactName: 'Location contact person',
      contactEmail: 'Contact email',
      contactPhone: 'Contact phone number',
      geoEnabled: 'Enable geo-fencing',
      geoLat: 'Latitude (required if geoEnabled)',
      geoLng: 'Longitude (required if geoEnabled)',
      geoRadius: 'Geo-fence radius in meters',
    },
    'Modules & Pricing': {
      locationName: 'Location name (for per-location config; blank for common)',
      selectedModules: 'Comma-separated module IDs (e.g., hr,production)',
      userTier: 'User tier key',
      customUserLimit: 'Custom user limit (for custom tier)',
      customTierPrice: 'Custom tier price (for custom tier)',
      billingType: 'Billing type key',
      trialDays: 'Trial period in days',
    },
    'Contacts': {
      name: 'Contact person name',
      designation: 'Job title (optional)',
      department: 'Department (optional)',
      type: 'Contact type',
      email: 'Contact email',
      countryCode: 'Country code (defaults to +91)',
      mobile: 'Mobile number',
      linkedin: 'LinkedIn URL (optional)',
    },
    'Shifts': {
      dayStartTime: 'Company day start (HH:mm)',
      dayEndTime: 'Company day end (HH:mm)',
      weeklyOffs: 'Comma-separated weekly offs (e.g., Sunday)',
      shiftName: 'Shift name',
      shiftFrom: 'Shift start time (HH:mm)',
      shiftTo: 'Shift end time (HH:mm)',
      noShuffle: 'Prevent shift shuffle',
    },
    'No Series': {
      code: 'Unique series code',
      linkedScreen: 'Linked screen value',
      description: 'Description (optional)',
      prefix: 'Number prefix (e.g., EMP-)',
      suffix: 'Number suffix (optional)',
      numberCount: 'Number of digits (e.g., 6)',
      startNumber: 'Starting number (e.g., 1)',
    },
    'IOT Reasons': {
      reasonType: 'Machine Idle or Machine Alarm',
      reason: 'Short reason label',
      description: 'Detailed description (optional)',
      department: 'Related department (optional)',
      planned: 'Is this a planned downtime?',
      duration: 'Expected duration in minutes (optional)',
    },
    'Controls': {
      ncEditMode: 'Enable NC edit mode',
      loadUnload: 'Enable load/unload tracking',
      cycleTime: 'Enable cycle time tracking',
      payrollLock: 'Enable payroll lock',
      leaveCarryForward: 'Enable leave carry forward',
      overtimeApproval: 'Enable overtime approval',
      mfa: 'Enable multi-factor authentication',
    },
    'Users': {
      fullName: 'Full name of the user',
      username: 'Login username',
      password: 'Password (defaults to AvyERP@2026)',
      role: 'User role',
      email: 'User email (must be globally unique)',
      mobile: 'Mobile number (optional)',
      department: 'Department (optional)',
    },
  };
  return descriptions[sheetName]?.[key] ?? key;
}

// ── Service Class ────────────────────────────────────────────────────

class BulkOnboardService {

  // ──────────────────────────────────────────────────────────────────
  // 1. Generate Template
  // ──────────────────────────────────────────────────────────────────

  async generateTemplate(): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Avy ERP';
    wb.created = new Date();

    // ── 15 Data Sheets ──────────────────────────────────────────────
    for (const sheetDef of ALL_SHEET_DEFS) {
      const ws = wb.addWorksheet(sheetDef.name);
      ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

      // Headers (row 1)
      const headers = sheetDef.cols.map((c) => c.header);
      const headerRow = ws.addRow(headers);
      styleHeaderRow(ws);

      // Column widths
      sheetDef.cols.forEach((_col, idx) => {
        const excelCol = ws.getColumn(idx + 1);
        const hdr = headers[idx] ?? '';
        excelCol.width = Math.max(hdr.length + 2, 20);
      });

      // Example row (row 2)
      const exData = EXAMPLE[sheetDef.name];
      if (exData) {
        const exValues = sheetDef.cols.map((c) => exData[c.key] ?? '');
        const exRow = ws.addRow(exValues);
        exRow.eachCell((cell) => {
          cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
        });
        ws.getCell('A2').note = 'Example row \u2014 delete before uploading';
      }

      // Dropdown validations (rows 3-102)
      const dropdowns = SHEET_DROPDOWNS[sheetDef.name];
      if (dropdowns) {
        const colIndex = (key: string): number =>
          sheetDef.cols.findIndex((c) => c.key === key) + 1;

        for (const [key, values] of Object.entries(dropdowns)) {
          const col = colIndex(key);
          if (col < 1) continue;
          const formulaStr = `"${values.join(',')}"`;
          for (let r = DROPDOWN_ROW_START; r <= DROPDOWN_ROW_END; r++) {
            ws.getCell(r, col).dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: [formulaStr],
              showErrorMessage: true,
              errorTitle: 'Invalid value',
              error: `Must be one of: ${values.slice(0, 5).join(', ')}${values.length > 5 ? '...' : ''}`,
            };
          }
        }
      }
    }

    // ── 5 Reference Sheets ──────────────────────────────────────────
    this.addReferenceSheet(wb, 'Indian States', ['Name'], C.INDIAN_STATES.map((s) => [s]));
    this.addReferenceSheet(wb, 'Business Types & Industries', ['Business Type', 'Industry'],
      this.zipColumns(C.BUSINESS_TYPES, C.INDUSTRIES));
    this.addReferenceSheet(wb, 'Facility Types', ['Name'], C.FACILITY_TYPES.map((f) => [f]));
    this.addReferenceSheet(wb, 'Module Catalogue', ['ID', 'Name', 'Description'],
      C.MODULE_CATALOGUE.map((m) => [m.id, m.name, m.description]));
    this.addReferenceSheet(wb, 'Linked Screens', ['Value', 'Label'],
      C.NO_SERIES_SCREENS.map((s) => [s.value, s.label]));

    // ── Instructions Sheet ──────────────────────────────────────────
    this.addInstructionsSheet(wb);

    return wb;
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Validate Upload
  // ──────────────────────────────────────────────────────────────────

  async validateUpload(fileBuffer: Buffer): Promise<ValidateUploadResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer as any);

    // Build header maps for all 15 sheets
    const sheetData = new Map<string, { cols: ColDef[]; headerMap: Map<string, number>; rows: Record<string, string>[] }>();

    for (const sheetDef of ALL_SHEET_DEFS) {
      const ws = wb.getWorksheet(sheetDef.name);
      if (!ws) {
        sheetData.set(sheetDef.name, { cols: sheetDef.cols, headerMap: new Map(), rows: [] });
        continue;
      }

      // Build header → column index map from row 1
      const headerMap = new Map<string, number>();
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const headerText = str(cell.value);
        // Match to ColDef
        const colDef = sheetDef.cols.find((c) => c.header === headerText);
        if (colDef) {
          headerMap.set(colDef.key, colNumber);
        }
      });

      // Read all data rows (skip header, skip example/italic rows)
      const rows: Record<string, string>[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return;

        // Skip example rows: check if first cell is italic
        const firstCell = row.getCell(1);
        if (firstCell.font?.italic) return;

        const displayNameCol = headerMap.get('displayName');
        const displayName = displayNameCol ? str(row.getCell(displayNameCol).value) : '';
        if (!displayName || displayName.startsWith('(Example')) return;

        const record: Record<string, string> = { _rowNumber: String(rowNumber) };
        for (const [key, colNum] of headerMap.entries()) {
          record[key] = str(row.getCell(colNum).value);
        }
        rows.push(record);
      });

      sheetData.set(sheetDef.name, { cols: sheetDef.cols, headerMap, rows });
    }

    // Get unique company display names from Company Identity sheet
    const identityData = sheetData.get('Company Identity');
    if (!identityData || identityData.rows.length === 0) {
      throw ApiError.badRequest('No companies found in the "Company Identity" sheet. Ensure data rows exist below the header.');
    }

    const companyNames = [...new Set(identityData.rows.map((r) => v(r, 'displayName')).filter(Boolean))];

    if (companyNames.length > MAX_COMPANIES) {
      throw ApiError.badRequest(`Maximum ${MAX_COMPANIES} companies allowed per upload. Found ${companyNames.length}.`);
    }

    // Cross-company duplicate tracking
    const allCompanyCodes = new Map<string, string>();
    const allSlugs = new Map<string, string>();
    const allUserEmails = new Map<string, string>();

    const companies: CompanyValidationResult[] = [];

    for (const companyName of companyNames) {
      const errors: ValidationError[] = [];
      const rowIndex = parseInt(identityData.rows.find((r) => r.displayName === companyName)?._rowNumber ?? '0', 10);

      // Extract rows for this company from each sheet
      const getRows = (sheetName: string): Record<string, string>[] => {
        const sd = sheetData.get(sheetName);
        if (!sd) return [];
        return sd.rows.filter((r) => r.displayName === companyName);
      };

      const getFirst = (sheetName: string): Record<string, string> => {
        const rows = getRows(sheetName);
        return rows[0] ?? {};
      };

      // ── Extract data ────────────────────────────────────────────
      const identity = getFirst('Company Identity');
      const statutory = getFirst('Statutory');
      const address = getFirst('Address');
      const fiscal = getFirst('Fiscal');
      const prefs = getFirst('Preferences');
      const endpoint = getFirst('Endpoint');
      const strategy = getFirst('Strategy');
      const locationRows = getRows('Locations');
      const moduleRows = getRows('Modules & Pricing');
      const contactRows = getRows('Contacts');
      const shiftRows = getRows('Shifts');
      const noSeriesRows = getRows('No Series');
      const iotRows = getRows('IOT Reasons');
      const controls = getFirst('Controls');
      const userRows = getRows('Users');

      // ── Validate required fields per sheet ──────────────────────
      const validateRequired = (sheetName: string, row: Record<string, string>, cols: ColDef[]): void => {
        for (const col of cols) {
          if (col.required && col.key !== 'displayName' && !row[col.key]) {
            errors.push({ sheet: sheetName, field: col.key, message: `${col.header.replace(' *', '')} is required` });
          }
        }
      };

      // Single-row sheets
      const singleSheets: { name: string; row: Record<string, string> }[] = [
        { name: 'Company Identity', row: identity },
        { name: 'Statutory', row: statutory },
        { name: 'Address', row: address },
        { name: 'Fiscal', row: fiscal },
      ];
      for (const s of singleSheets) {
        const def = ALL_SHEET_DEFS.find((d) => d.name === s.name);
        if (def && Object.keys(s.row).length > 0) validateRequired(s.name, s.row, def.cols);
      }

      // Multi-row sheets
      const multiSheets: { name: string; rows: Record<string, string>[] }[] = [
        { name: 'Locations', rows: locationRows },
        { name: 'Contacts', rows: contactRows },
        { name: 'Shifts', rows: shiftRows },
        { name: 'No Series', rows: noSeriesRows },
        { name: 'IOT Reasons', rows: iotRows },
        { name: 'Users', rows: userRows },
        { name: 'Modules & Pricing', rows: moduleRows },
      ];
      for (const s of multiSheets) {
        const def = ALL_SHEET_DEFS.find((d) => d.name === s.name);
        if (def) {
          for (const row of s.rows) {
            validateRequired(s.name, row, def.cols);
          }
        }
      }

      // ── Enum validations ────────────────────────────────────────
      const validateEnum = (sheet: string, field: string, value: string | undefined, allowed: string[]): void => {
        if (value && !allowed.includes(value)) {
          errors.push({ sheet, field, message: `Invalid ${field}: "${value}". Must be one of: ${allowed.slice(0, 5).join(', ')}${allowed.length > 5 ? '...' : ''}` });
        }
      };

      validateEnum('Company Identity', 'businessType', v(identity, 'businessType'), C.BUSINESS_TYPES);
      validateEnum('Company Identity', 'industry', v(identity, 'industry'), C.INDUSTRIES);
      validateEnum('Company Identity', 'status', v(identity, 'status'), C.COMPANY_STATUSES);
      validateEnum('Statutory', 'rocState', v(statutory, 'rocState'), C.INDIAN_STATES);
      validateEnum('Address', 'regState', v(address, 'regState'), C.INDIAN_STATES);
      validateEnum('Address', 'corpState', v(address, 'corpState'), C.INDIAN_STATES);
      validateEnum('Fiscal', 'fyType', v(fiscal, 'fyType'), C.FY_TYPES);
      validateEnum('Fiscal', 'weekStart', v(fiscal, 'weekStart'), C.WEEK_STARTS);
      validateEnum('Fiscal', 'timezone', v(fiscal, 'timezone'), C.TIMEZONES);
      validateEnum('Fiscal', 'cutoffDay', v(fiscal, 'cutoffDay'), C.CUTOFF_DAYS);
      validateEnum('Fiscal', 'disbursementDay', v(fiscal, 'disbursementDay'), C.DISBURSEMENT_DAYS);
      validateEnum('Preferences', 'dateFormat', v(prefs, 'dateFormat'), C.DATE_FORMATS);

      for (const loc of locationRows) {
        validateEnum('Locations', 'facilityType', v(loc, 'facilityType'), C.FACILITY_TYPES);
        validateEnum('Locations', 'status', v(loc, 'status'), C.FACILITY_STATUSES);
      }
      for (const mod of moduleRows) {
        validateEnum('Modules & Pricing', 'userTier', v(mod, 'userTier'), C.USER_TIERS.map((t) => t.key));
        validateEnum('Modules & Pricing', 'billingType', v(mod, 'billingType'), C.BILLING_TYPES.map((t) => t.key));
      }
      for (const contact of contactRows) {
        validateEnum('Contacts', 'type', v(contact, 'type'), C.CONTACT_TYPES);
      }
      for (const ns of noSeriesRows) {
        validateEnum('No Series', 'linkedScreen', v(ns, 'linkedScreen'), C.NO_SERIES_SCREENS.map((s) => s.value));
      }
      for (const iot of iotRows) {
        validateEnum('IOT Reasons', 'reasonType', v(iot, 'reasonType'), C.IOT_REASON_TYPES);
      }
      for (const usr of userRows) {
        validateEnum('Users', 'role', v(usr, 'role'), C.USER_ROLES);
      }

      // ── Format validations ──────────────────────────────────────
      // Email
      for (const usr of userRows) {
        const email = v(usr, 'email');
        if (email && !EMAIL_RE.test(email)) {
          errors.push({ sheet: 'Users', field: 'email', message: `Invalid email format: "${email}"` });
        }
      }
      for (const contact of contactRows) {
        const email = v(contact, 'email');
        if (email && !EMAIL_RE.test(email)) {
          errors.push({ sheet: 'Contacts', field: 'email', message: `Invalid email format: "${email}"` });
        }
      }

      // PIN codes
      const regPin = v(address, 'regPin');
      if (regPin && !PIN_RE.test(regPin)) {
        errors.push({ sheet: 'Address', field: 'regPin', message: 'Registered PIN must be 6 digits' });
      }
      const corpPin = v(address, 'corpPin');
      if (corpPin && !PIN_RE.test(corpPin)) {
        errors.push({ sheet: 'Address', field: 'corpPin', message: 'Corporate PIN must be 6 digits' });
      }

      // Slug
      const slugVal = v(identity, 'slug');
      if (slugVal) {
        if (!SLUG_RE.test(slugVal)) {
          errors.push({ sheet: 'Company Identity', field: 'slug', message: 'Slug must be lowercase alphanumeric with hyphens only' });
        }
        if (C.RESERVED_SLUGS.has(slugVal)) {
          errors.push({ sheet: 'Company Identity', field: 'slug', message: `Slug "${slugVal}" is reserved` });
        }
      }

      // Dates
      const incDate = v(identity, 'incorporationDate');
      if (incDate && !DATE_RE.test(incDate)) {
        errors.push({ sheet: 'Company Identity', field: 'incorporationDate', message: 'Date must be YYYY-MM-DD format' });
      }

      // ── Cross-sheet validations ─────────────────────────────────
      const sameAsReg = parseYesNo(v(address, 'sameAsRegistered'));
      if (!sameAsReg) {
        if (!v(address, 'corpLine1')) errors.push({ sheet: 'Address', field: 'corpLine1', message: 'Corporate address line 1 required when sameAsRegistered=No' });
        if (!v(address, 'corpCity')) errors.push({ sheet: 'Address', field: 'corpCity', message: 'Corporate city required when sameAsRegistered=No' });
        if (!v(address, 'corpState')) errors.push({ sheet: 'Address', field: 'corpState', message: 'Corporate state required when sameAsRegistered=No' });
        if (!v(address, 'corpCountry')) errors.push({ sheet: 'Address', field: 'corpCountry', message: 'Corporate country required when sameAsRegistered=No' });
        if (!v(address, 'corpPin')) errors.push({ sheet: 'Address', field: 'corpPin', message: 'Corporate PIN required when sameAsRegistered=No' });
      }

      const endType = v(endpoint, 'endpointType') || 'default';
      if (endType === 'custom' && !v(endpoint, 'customBaseUrl')) {
        errors.push({ sheet: 'Endpoint', field: 'customBaseUrl', message: 'Custom base URL required when endpointType=custom' });
      }

      // ── Cross-company duplicate checks ──────────────────────────
      const compCode = v(identity, 'companyCode');
      if (compCode) {
        if (allCompanyCodes.has(compCode)) {
          errors.push({ sheet: 'Company Identity', field: 'companyCode', message: `Duplicate company code "${compCode}" — also used by "${allCompanyCodes.get(compCode)}"` });
        } else {
          allCompanyCodes.set(compCode, companyName);
        }
      }

      if (slugVal) {
        if (allSlugs.has(slugVal)) {
          errors.push({ sheet: 'Company Identity', field: 'slug', message: `Duplicate slug "${slugVal}" — also used by "${allSlugs.get(slugVal)}"` });
        } else {
          allSlugs.set(slugVal, companyName);
        }
      }

      for (const usr of userRows) {
        const email = v(usr, 'email');
        if (email) {
          if (allUserEmails.has(email)) {
            errors.push({ sheet: 'Users', field: 'email', message: `Duplicate email "${email}" — also used by "${allUserEmails.get(email)}"` });
          } else {
            allUserEmails.set(email, companyName);
          }
        }
      }

      // ── DB uniqueness checks ────────────────────────────────────
      if (compCode) {
        const existing = await platformPrisma.company.findUnique({ where: { companyCode: compCode } });
        if (existing) {
          errors.push({ sheet: 'Company Identity', field: 'companyCode', message: `Company code "${compCode}" already exists in the database` });
        }
      }

      if (slugVal) {
        const existing = await platformPrisma.tenant.findFirst({ where: { slug: slugVal } });
        if (existing) {
          errors.push({ sheet: 'Company Identity', field: 'slug', message: `Slug "${slugVal}" already exists in the database` });
        }
      }

      for (const usr of userRows) {
        const email = v(usr, 'email');
        if (email) {
          const existing = await platformPrisma.user.findFirst({ where: { email } });
          if (existing) {
            errors.push({ sheet: 'Users', field: 'email', message: `Email "${email}" already exists in the database` });
          }
        }
      }

      // ── Assemble payload ────────────────────────────────────────
      if (errors.length === 0) {
        // Parse comma-separated fields
        const wdRaw = v(fiscal, 'workingDays');
        const workingDays = wdRaw ? wdRaw.split(',').map((d) => d.trim()).filter(Boolean) : [];
        const woRaw = v(shiftRows[0] ?? {}, 'weeklyOffs');
        const weeklyOffs = woRaw ? woRaw.split(',').map((d) => d.trim()).filter(Boolean) : [];
        const modRaw = v(moduleRows[0] ?? {}, 'selectedModules');
        const selectedModuleIds = modRaw ? modRaw.split(',').map((m) => m.trim()).filter(Boolean) : [];

        const firstMod = moduleRows[0] ?? {};
        const firstShift = shiftRows[0] ?? {};

        const corpAddr = sameAsReg ? undefined : stripUndefined({
          line1: v(address, 'corpLine1'),
          line2: optStr(address, 'corpLine2'),
          city: v(address, 'corpCity'),
          district: optStr(address, 'corpDistrict'),
          state: v(address, 'corpState'),
          pin: v(address, 'corpPin'),
          country: v(address, 'corpCountry'),
          stdCode: optStr(address, 'corpStdCode'),
        });

        const payload = {
          identity: stripUndefined({
            displayName: v(identity, 'displayName'),
            legalName: v(identity, 'legalName'),
            slug: v(identity, 'slug'),
            businessType: v(identity, 'businessType'),
            industry: v(identity, 'industry'),
            companyCode: v(identity, 'companyCode'),
            shortName: optStr(identity, 'shortName'),
            incorporationDate: optStr(identity, 'incorporationDate'),
            employeeCount: optStr(identity, 'employees'),
            cin: optStr(identity, 'cin'),
            website: optStr(identity, 'website'),
            emailDomain: v(identity, 'emailDomain'),
            wizardStatus: optStr(identity, 'status'),
          }),
          statutory: stripUndefined({
            pan: v(statutory, 'pan'),
            tan: optStr(statutory, 'tan'),
            gstin: optStr(statutory, 'gstin'),
            pfRegNo: optStr(statutory, 'pfRegNo'),
            esiCode: optStr(statutory, 'esiCode'),
            ptReg: optStr(statutory, 'ptReg'),
            lwfrNo: optStr(statutory, 'lwfrNo'),
            rocState: optStr(statutory, 'rocState'),
          }),
          address: stripUndefined({
            registered: stripUndefined({
              line1: v(address, 'regLine1'),
              line2: optStr(address, 'regLine2'),
              city: v(address, 'regCity'),
              district: optStr(address, 'regDistrict'),
              state: v(address, 'regState'),
              pin: v(address, 'regPin'),
              country: v(address, 'regCountry'),
              stdCode: optStr(address, 'regStdCode'),
            }),
            sameAsRegistered: sameAsReg,
            corporate: corpAddr,
          }),
          fiscal: stripUndefined({
            fyType: v(fiscal, 'fyType'),
            fyCustomStartMonth: optStr(fiscal, 'fyCustomStartMonth'),
            fyCustomEndMonth: optStr(fiscal, 'fyCustomEndMonth'),
            payrollFreq: v(fiscal, 'payrollFreq') || 'Monthly',
            cutoffDay: v(fiscal, 'cutoffDay') || 'Last Working Day',
            disbursementDay: v(fiscal, 'disbursementDay') || '1st',
            weekStart: v(fiscal, 'weekStart'),
            timezone: v(fiscal, 'timezone') || 'IST UTC+5:30',
            workingDays,
          }),
          preferences: {
            currency: v(prefs, 'currency') || 'INR — ₹',
            language: v(prefs, 'language') || 'English',
            dateFormat: v(prefs, 'dateFormat') || 'DD/MM/YYYY',
            indiaCompliance: parseYesNo(v(prefs, 'indiaCompliance')),
            mobileApp: parseYesNo(v(prefs, 'mobileApp')),
            webApp: parseYesNo(v(prefs, 'webApp')),
            systemApp: parseYesNo(v(prefs, 'systemApp')),
            biometric: false,
            bankIntegration: parseYesNo(v(prefs, 'bankIntegration')),
            emailNotif: parseYesNo(v(prefs, 'emailNotif')),
          },
          endpoint: stripUndefined({
            endpointType: (endType === 'custom' ? 'custom' : 'default') as 'default' | 'custom',
            customBaseUrl: endType === 'custom' ? optStr(endpoint, 'customBaseUrl') : undefined,
          }),
          strategy: {
            multiLocationMode: parseYesNo(v(strategy, 'multiLocationMode')),
            locationConfig: (v(strategy, 'locationConfig') === 'per-location' ? 'per-location' : 'common') as 'common' | 'per-location',
          },
          locations: locationRows.map((loc) => stripUndefined({
            name: v(loc, 'name'),
            code: v(loc, 'code'),
            facilityType: v(loc, 'facilityType'),
            status: v(loc, 'status') || 'Active',
            isHQ: parseYesNo(v(loc, 'isHQ')),
            addressLine1: optStr(loc, 'addressLine1'),
            addressLine2: optStr(loc, 'addressLine2'),
            city: optStr(loc, 'city'),
            district: optStr(loc, 'district'),
            state: optStr(loc, 'state'),
            pin: optStr(loc, 'pin'),
            gstin: optStr(loc, 'gstin'),
            contactName: optStr(loc, 'contactName'),
            contactEmail: optStr(loc, 'contactEmail'),
            contactPhone: optStr(loc, 'contactPhone'),
            geoEnabled: parseYesNo(v(loc, 'geoEnabled')),
            geoLat: optStr(loc, 'geoLat'),
            geoLng: optStr(loc, 'geoLng'),
            geoRadius: optInt(loc, 'geoRadius'),
          })),
          commercial: stripUndefined({
            selectedModuleIds,
            userTier: optStr(firstMod, 'userTier'),
            billingType: optStr(firstMod, 'billingType'),
            customUserLimit: optStr(firstMod, 'customUserLimit'),
            customTierPrice: optStr(firstMod, 'customTierPrice'),
            trialDays: optInt(firstMod, 'trialDays'),
          }),
          contacts: contactRows.map((c) => stripUndefined({
            name: v(c, 'name'),
            designation: optStr(c, 'designation'),
            department: optStr(c, 'department'),
            type: v(c, 'type') || 'Primary',
            email: v(c, 'email'),
            countryCode: v(c, 'countryCode') || '+91',
            mobile: v(c, 'mobile'),
            linkedin: optStr(c, 'linkedin'),
          })),
          shifts: stripUndefined({
            dayStartTime: optStr(firstShift, 'dayStartTime'),
            dayEndTime: optStr(firstShift, 'dayEndTime'),
            weeklyOffs,
            items: shiftRows.map((s) => stripUndefined({
              name: v(s, 'shiftName'),
              fromTime: v(s, 'shiftFrom'),
              toTime: v(s, 'shiftTo'),
              noShuffle: parseYesNo(v(s, 'noShuffle')),
            })),
          }),
          noSeries: noSeriesRows.map((ns) => stripUndefined({
            code: v(ns, 'code'),
            linkedScreen: v(ns, 'linkedScreen'),
            description: optStr(ns, 'description'),
            prefix: v(ns, 'prefix'),
            suffix: optStr(ns, 'suffix'),
            numberCount: optInt(ns, 'numberCount'),
            startNumber: optInt(ns, 'startNumber'),
          })),
          iotReasons: iotRows.map((iot) => stripUndefined({
            reasonType: v(iot, 'reasonType'),
            reason: v(iot, 'reason'),
            description: optStr(iot, 'description'),
            department: optStr(iot, 'department'),
            planned: parseYesNo(v(iot, 'planned')),
            duration: optStr(iot, 'duration'),
          })),
          controls: {
            ncEditMode: parseYesNo(v(controls, 'ncEditMode')),
            loadUnload: parseYesNo(v(controls, 'loadUnload')),
            cycleTime: parseYesNo(v(controls, 'cycleTime')),
            payrollLock: parseYesNo(v(controls, 'payrollLock')),
            leaveCarryForward: parseYesNo(v(controls, 'leaveCarryForward')),
            overtimeApproval: parseYesNo(v(controls, 'overtimeApproval')),
            mfa: parseYesNo(v(controls, 'mfa')),
          },
          users: userRows.map((u) => stripUndefined({
            fullName: v(u, 'fullName'),
            username: v(u, 'username'),
            password: v(u, 'password') || 'AvyERP@2026',
            role: v(u, 'role') || 'Company Admin',
            email: v(u, 'email'),
            mobile: optStr(u, 'mobile'),
            department: optStr(u, 'department'),
          })),
        } as OnboardTenantPayload;

        companies.push({ name: companyName, rowIndex, valid: true, payload });
      } else {
        companies.push({ name: companyName, rowIndex, valid: false, errors });
      }
    }

    const validCount = companies.filter((c) => c.valid).length;
    const errorCount = companies.filter((c) => !c.valid).length;

    return {
      totalCompanies: companies.length,
      validCount,
      errorCount,
      companies,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Import Companies
  // ──────────────────────────────────────────────────────────────────

  async importCompanies(companies: { name: string; payload: OnboardTenantPayload }[]): Promise<ImportCompaniesResult> {
    const results: ImportResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const company of companies) {
      try {
        logger.info(`[BulkOnboard] Onboarding company: ${company.name}`);
        const result = await tenantService.onboardTenant(company.payload);
        const companyId = result.company.id;
        results.push({ name: company.name, success: true, companyId });
        successCount++;
        logger.info(`[BulkOnboard] Successfully onboarded: ${company.name} (ID: ${companyId})`);
      } catch (err: unknown) {
        failureCount++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ name: company.name, success: false, error: errorMsg });
        logger.error(`[BulkOnboard] Failed to onboard: ${company.name} — ${errorMsg}`);
      }
    }

    return {
      total: companies.length,
      successCount,
      failureCount,
      results,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private addReferenceSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: string[][]): void {
    const ws = wb.addWorksheet(name);
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    // Headers
    const headerRow = ws.addRow(headers);
    styleHeaderRow(ws);

    // Column widths
    headers.forEach((_h, idx) => {
      ws.getColumn(idx + 1).width = Math.max((headers[idx] ?? '').length + 2, 25);
    });

    // Data rows with alternating fill
    rows.forEach((rowData, idx) => {
      const row = ws.addRow(rowData);
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = ALT_ROW_FILL;
        });
      }
    });

    // Protect the reference sheet
    ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }

  private addInstructionsSheet(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet('Instructions');
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    const headers = ['Sheet', 'Column', 'Required', 'Description'];
    ws.addRow(headers);
    styleHeaderRow(ws);

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 28;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 60;

    // One row per column across all 15 sheets
    let rowIdx = 0;
    for (const sheetDef of ALL_SHEET_DEFS) {
      for (const col of sheetDef.cols) {
        if (col.key === 'displayName') {
          // Only show displayName once for the first sheet
          if (sheetDef.name === 'Company Identity') {
            const row = ws.addRow([sheetDef.name, col.header, col.required ? 'Yes' : 'No', getFieldDescription(sheetDef.name, col.key)]);
            if (rowIdx % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_ROW_FILL; });
            rowIdx++;
          }
          continue;
        }
        const row = ws.addRow([sheetDef.name, col.header, col.required ? 'Yes' : 'No', getFieldDescription(sheetDef.name, col.key)]);
        if (rowIdx % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_ROW_FILL; });
        rowIdx++;
      }
    }

    // Notes at the bottom
    ws.addRow([]);
    const notes = [
      'IMPORTANT NOTES:',
      '1. Delete the example rows (row 2 in each sheet) before uploading.',
      '2. The "Display Name" column links data across sheets — it must match exactly.',
      '3. Date fields must use YYYY-MM-DD format (e.g., 2024-01-15).',
      '4. For comma-separated fields (workingDays, weeklyOffs, selectedModules), use commas without spaces around them.',
      `5. Maximum ${MAX_COMPANIES} companies per upload.`,
      '6. Reference sheets (Indian States, Business Types, etc.) are read-only for your convenience.',
      '7. User passwords default to "AvyERP@2026" if left blank.',
    ];
    for (const note of notes) {
      const row = ws.addRow([note]);
      if (note === 'IMPORTANT NOTES:') {
        row.getCell(1).font = { bold: true, size: 12 };
      }
    }

    ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }

  private zipColumns(col1: string[], col2: string[]): string[][] {
    const maxLen = Math.max(col1.length, col2.length);
    const result: string[][] = [];
    for (let i = 0; i < maxLen; i++) {
      result.push([col1[i] ?? '', col2[i] ?? '']);
    }
    return result;
  }
}

export const bulkOnboardService = new BulkOnboardService();
