// ============================================================
// Bulk Company Onboarding — Column Definitions & Validators
// Mirrors: web-system-app/src/features/super-admin/bulk-upload/bulk-upload-utils.ts
// ============================================================

import { z } from 'zod';

// ============ ColDef Interface ============

export interface ColDef {
  header: string;
  key: string;
  required: boolean;
}

// ============ Company Identity (13 cols) ============

export const IDENTITY_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Legal Name *', key: 'legalName', required: true },
  { header: 'Slug *', key: 'slug', required: true },
  { header: 'Business Type *', key: 'businessType', required: true },
  { header: 'Industry *', key: 'industry', required: true },
  { header: 'Company Code *', key: 'companyCode', required: true },
  { header: 'Short Name', key: 'shortName', required: false },
  { header: 'Incorporation Date *', key: 'incorporationDate', required: true },
  { header: 'Employee Count', key: 'employees', required: false },
  { header: 'CIN', key: 'cin', required: false },
  { header: 'Website', key: 'website', required: false },
  { header: 'Email Domain *', key: 'emailDomain', required: true },
  { header: 'Status *', key: 'status', required: true },
];

// ============ Statutory (9 cols) ============

export const STATUTORY_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'PAN *', key: 'pan', required: true },
  { header: 'TAN', key: 'tan', required: false },
  { header: 'GSTIN', key: 'gstin', required: false },
  { header: 'PF Reg No', key: 'pfRegNo', required: false },
  { header: 'ESI Code', key: 'esiCode', required: false },
  { header: 'PT Reg No', key: 'ptReg', required: false },
  { header: 'LWFR No', key: 'lwfrNo', required: false },
  { header: 'ROC State', key: 'rocState', required: false },
];

// ============ Address (18 cols) ============

export const ADDRESS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Reg Address Line 1 *', key: 'regLine1', required: true },
  { header: 'Reg Address Line 2', key: 'regLine2', required: false },
  { header: 'Reg City *', key: 'regCity', required: true },
  { header: 'Reg District', key: 'regDistrict', required: false },
  { header: 'Reg State *', key: 'regState', required: true },
  { header: 'Reg Country *', key: 'regCountry', required: true },
  { header: 'Reg PIN *', key: 'regPin', required: true },
  { header: 'Reg STD Code', key: 'regStdCode', required: false },
  { header: 'Same as Registered', key: 'sameAsRegistered', required: false },
  { header: 'Corp Address Line 1', key: 'corpLine1', required: false },
  { header: 'Corp Address Line 2', key: 'corpLine2', required: false },
  { header: 'Corp City', key: 'corpCity', required: false },
  { header: 'Corp District', key: 'corpDistrict', required: false },
  { header: 'Corp State', key: 'corpState', required: false },
  { header: 'Corp Country', key: 'corpCountry', required: false },
  { header: 'Corp PIN', key: 'corpPin', required: false },
  { header: 'Corp STD Code', key: 'corpStdCode', required: false },
];

// ============ Fiscal (10 cols) ============

export const FISCAL_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'FY Type *', key: 'fyType', required: true },
  { header: 'FY Custom Start Month', key: 'fyCustomStartMonth', required: false },
  { header: 'FY Custom End Month', key: 'fyCustomEndMonth', required: false },
  { header: 'Payroll Frequency', key: 'payrollFreq', required: false },
  { header: 'Cutoff Day', key: 'cutoffDay', required: false },
  { header: 'Disbursement Day', key: 'disbursementDay', required: false },
  { header: 'Week Start *', key: 'weekStart', required: true },
  { header: 'Timezone', key: 'timezone', required: false },
  { header: 'Working Days *', key: 'workingDays', required: true },
];

// ============ Preferences (10 cols) ============

export const PREFERENCES_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Currency', key: 'currency', required: false },
  { header: 'Language', key: 'language', required: false },
  { header: 'Date Format', key: 'dateFormat', required: false },
  { header: 'India Compliance', key: 'indiaCompliance', required: false },
  { header: 'Mobile App', key: 'mobileApp', required: false },
  { header: 'Web App', key: 'webApp', required: false },
  { header: 'System App', key: 'systemApp', required: false },
  { header: 'Bank Integration', key: 'bankIntegration', required: false },
  { header: 'Email Notifications', key: 'emailNotif', required: false },
];

// ============ Endpoint (3 cols) ============

export const ENDPOINT_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Endpoint Type', key: 'endpointType', required: false },
  { header: 'Custom Base URL', key: 'customBaseUrl', required: false },
];

// ============ Strategy (3 cols) ============

export const STRATEGY_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Multi-Location Mode', key: 'multiLocationMode', required: false },
  { header: 'Location Config', key: 'locationConfig', required: false },
];

// ============ Locations (20 cols) ============

export const LOCATIONS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Location Name *', key: 'name', required: true },
  { header: 'Location Code *', key: 'code', required: true },
  { header: 'Facility Type *', key: 'facilityType', required: true },
  { header: 'Status', key: 'status', required: false },
  { header: 'Is HQ', key: 'isHQ', required: false },
  { header: 'GSTIN', key: 'gstin', required: false },
  { header: 'Address Line 1 *', key: 'addressLine1', required: true },
  { header: 'Address Line 2', key: 'addressLine2', required: false },
  { header: 'City *', key: 'city', required: true },
  { header: 'District', key: 'district', required: false },
  { header: 'State', key: 'state', required: false },
  { header: 'PIN', key: 'pin', required: false },
  { header: 'Contact Name', key: 'contactName', required: false },
  { header: 'Contact Email', key: 'contactEmail', required: false },
  { header: 'Contact Phone', key: 'contactPhone', required: false },
  { header: 'Geo Enabled', key: 'geoEnabled', required: false },
  { header: 'Geo Lat', key: 'geoLat', required: false },
  { header: 'Geo Lng', key: 'geoLng', required: false },
  { header: 'Geo Radius (m)', key: 'geoRadius', required: false },
];

// ============ Modules & Pricing (8 cols) ============

export const MODULES_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Location Name', key: 'locationName', required: false },
  { header: 'Selected Modules *', key: 'selectedModules', required: true },
  { header: 'User Tier *', key: 'userTier', required: true },
  { header: 'Custom User Limit', key: 'customUserLimit', required: false },
  { header: 'Custom Tier Price', key: 'customTierPrice', required: false },
  { header: 'Billing Type *', key: 'billingType', required: true },
  { header: 'Trial Days', key: 'trialDays', required: false },
];

// ============ Contacts (9 cols) ============

export const CONTACTS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Contact Name *', key: 'name', required: true },
  { header: 'Designation', key: 'designation', required: false },
  { header: 'Department', key: 'department', required: false },
  { header: 'Type', key: 'type', required: false },
  { header: 'Email', key: 'email', required: false },
  { header: 'Country Code', key: 'countryCode', required: false },
  { header: 'Mobile', key: 'mobile', required: false },
  { header: 'LinkedIn', key: 'linkedin', required: false },
];

// ============ Shifts (8 cols) ============

export const SHIFTS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Day Start Time *', key: 'dayStartTime', required: true },
  { header: 'Day End Time *', key: 'dayEndTime', required: true },
  { header: 'Weekly Offs', key: 'weeklyOffs', required: false },
  { header: 'Shift Name *', key: 'shiftName', required: true },
  { header: 'Shift From *', key: 'shiftFrom', required: true },
  { header: 'Shift To *', key: 'shiftTo', required: true },
  { header: 'No Shuffle', key: 'noShuffle', required: false },
];

// ============ No Series (8 cols) ============

export const NO_SERIES_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Series Code *', key: 'code', required: true },
  { header: 'Linked Screen *', key: 'linkedScreen', required: true },
  { header: 'Description', key: 'description', required: false },
  { header: 'Prefix', key: 'prefix', required: false },
  { header: 'Suffix', key: 'suffix', required: false },
  { header: 'Number Count', key: 'numberCount', required: false },
  { header: 'Start Number', key: 'startNumber', required: false },
];

// ============ IOT Reasons (7 cols) ============

export const IOT_REASONS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Reason Type *', key: 'reasonType', required: true },
  { header: 'Reason *', key: 'reason', required: true },
  { header: 'Description', key: 'description', required: false },
  { header: 'Department', key: 'department', required: false },
  { header: 'Planned', key: 'planned', required: false },
  { header: 'Duration (min)', key: 'duration', required: false },
];

// ============ Controls (8 cols) ============

export const CONTROLS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'NC Edit Mode', key: 'ncEditMode', required: false },
  { header: 'Load/Unload Tracking', key: 'loadUnload', required: false },
  { header: 'Cycle Time', key: 'cycleTime', required: false },
  { header: 'Payroll Lock', key: 'payrollLock', required: false },
  { header: 'Leave Carry Forward', key: 'leaveCarryForward', required: false },
  { header: 'Overtime Approval', key: 'overtimeApproval', required: false },
  { header: 'MFA', key: 'mfa', required: false },
];

// ============ Users (8 cols) ============

export const USERS_COLS: ColDef[] = [
  { header: 'Display Name *', key: 'displayName', required: true },
  { header: 'Full Name *', key: 'fullName', required: true },
  { header: 'Username *', key: 'username', required: true },
  { header: 'Password', key: 'password', required: false },
  { header: 'Role *', key: 'role', required: true },
  { header: 'Email *', key: 'email', required: true },
  { header: 'Mobile', key: 'mobile', required: false },
  { header: 'Department', key: 'department', required: false },
];

// ============ All Sheet Definitions ============

export const ALL_SHEET_DEFS: { name: string; cols: ColDef[] }[] = [
  { name: 'Company Identity', cols: IDENTITY_COLS },
  { name: 'Statutory', cols: STATUTORY_COLS },
  { name: 'Address', cols: ADDRESS_COLS },
  { name: 'Fiscal', cols: FISCAL_COLS },
  { name: 'Preferences', cols: PREFERENCES_COLS },
  { name: 'Endpoint', cols: ENDPOINT_COLS },
  { name: 'Strategy', cols: STRATEGY_COLS },
  { name: 'Locations', cols: LOCATIONS_COLS },
  { name: 'Modules & Pricing', cols: MODULES_COLS },
  { name: 'Contacts', cols: CONTACTS_COLS },
  { name: 'Shifts', cols: SHIFTS_COLS },
  { name: 'No Series', cols: NO_SERIES_COLS },
  { name: 'IOT Reasons', cols: IOT_REASONS_COLS },
  { name: 'Controls', cols: CONTROLS_COLS },
  { name: 'Users', cols: USERS_COLS },
];

// ============ Zod Schemas ============

export const bulkOnboardImportBodySchema = z.object({
  companies: z.array(z.object({
    name: z.string().min(1),
    payload: z.record(z.any()),
  })).min(1, 'At least one company is required'),
});
