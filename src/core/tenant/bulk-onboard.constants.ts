// ============================================================
// Bulk Company Onboarding — Backend Constants
// Mirrors: web-system-app/src/features/super-admin/tenant-onboarding/constants.ts
// Used for Excel template dropdown validations & validation logic
// ============================================================

// ============ COMPANY ============

export const BUSINESS_TYPES: string[] = [
  'Private Limited (Pvt. Ltd.)',
  'Public Limited',
  'Partnership',
  'Proprietorship',
  'Others',
];

export const INDUSTRIES: string[] = [
  'IT', 'Manufacturing', 'BFSI', 'Healthcare', 'Retail',
  'Automotive', 'Pharma', 'Education', 'Steel & Metal',
  'Textiles', 'Plastics', 'Electronics', 'Food Processing',
  'Heavy Engineering', 'CNC Machining', 'Chemicals', 'Logistics',
  'Construction', 'Real Estate', 'E-Commerce', 'Other',
];

export const COMPANY_STATUSES: string[] = [
  'Draft', 'Pilot', 'Active', 'Inactive',
];

// ============ GEO ============

export const INDIAN_STATES: string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
  'Chandigarh', 'Others',
];

// ============ FISCAL & CALENDAR ============

export const FY_TYPES: string[] = ['apr-mar', 'custom'];

export const WEEK_STARTS: string[] = [
  'Monday', 'Sunday', 'Saturday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
];

export const DAYS_OF_WEEK: string[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const PAYROLL_FREQUENCIES: string[] = [
  'Monthly', 'Semi-Monthly', 'Fortnightly', 'Bi-Weekly', 'Weekly', 'Daily',
];

export const CUTOFF_DAYS: string[] = [
  '1st', '5th', '10th', '15th', '20th', '25th', '28th',
  'Last Working Day', 'Last Day of Month',
];

export const DISBURSEMENT_DAYS: string[] = [
  '1st', '3rd', '5th', '7th', '10th', '15th', '28th',
  'Last Day', 'Same Day as Cutoff',
];

// ============ TIMEZONES ============

export const TIMEZONES: string[] = [
  'UTC UTC+0:00',
  'GMT UTC+0:00',
  'WET UTC+0:00',
  'CET UTC+1:00',
  'EET UTC+2:00',
  'MSK UTC+3:00',
  'GST UTC+4:00',
  'PKT UTC+5:00',
  'IST UTC+5:30',
  'BST UTC+6:00',
  'ICT UTC+7:00',
  'CST UTC+8:00',
  'JST UTC+9:00',
  'AEST UTC+10:00',
  'NZST UTC+12:00',
  'EST UTC-5:00',
  'CST UTC-6:00',
  'MST UTC-7:00',
  'PST UTC-8:00',
  'AKST UTC-9:00',
  'HST UTC-10:00',
];

// ============ PREFERENCES ============

export const CURRENCIES: string[] = ['INR — ₹', 'USD — $', 'GBP — £', 'EUR — €', 'AED — د.إ'];

export const LANGUAGES: string[] = ['English', 'Hindi', 'Tamil', 'Kannada', 'Telugu', 'Malayalam'];

export const DATE_FORMATS: string[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

// ============ LOCATIONS ============

export const FACILITY_TYPES: string[] = [
  'Head Office', 'Regional Office', 'Branch Office', 'Satellite Office',
  'Manufacturing Plant', 'Assembly Unit', 'Warehouse / Distribution',
  'R&D Centre', 'Data Centre', 'Training Centre', 'Service Centre',
  'Customer Support Centre', 'Sales Office', 'Distribution Centre',
  'Factory', 'Retail Store', 'Custom...',
];

export const FACILITY_STATUSES: string[] = ['Active', 'Inactive', 'Under Construction'];

export const CONTACT_TYPES: string[] = [
  'Primary', 'HR Contact', 'Finance Contact',
  'IT Contact', 'Legal Contact', 'Operations Contact',
];

// ============ MODULES CATALOGUE ============

export const MODULE_CATALOGUE: { id: string; name: string; description: string }[] = [
  { id: 'hr', name: 'HR Management', description: 'Employee directory, attendance, leave, payroll, incentives' },
  { id: 'security', name: 'Security', description: 'Gate attendance, goods verification, visitor management' },
  { id: 'production', name: 'Production', description: 'OEE dashboard, production logging, scrap & NC tracking' },
  { id: 'machine-maintenance', name: 'Machine Maintenance', description: 'PM scheduling, breakdown management, spare parts, OEE data' },
  { id: 'inventory', name: 'Inventory', description: 'Stock management, goods receipt, material requests & issues' },
  { id: 'vendor', name: 'Vendor Management', description: 'Vendor directory, purchase orders, ASN/GRN, delivery ratings' },
  { id: 'sales', name: 'Sales & Invoicing', description: 'Quotes, GST invoices, customer ledger, payment tracking' },
  { id: 'finance', name: 'Finance', description: 'Payables, receivables, payments, P&L, balance sheet, cash flow' },
  { id: 'visitor', name: 'Visitor Management', description: 'Pre-registration, QR self-check-in, visit history & audit trail' },
  { id: 'masters', name: 'Masters', description: 'Item master, shift master, machine master, operation & part master' },
];

// ============ USER TIERS ============

export const USER_TIERS: { key: string; label: string }[] = [
  { key: 'starter', label: 'Starter' },
  { key: 'growth', label: 'Growth' },
  { key: 'scale', label: 'Scale' },
  { key: 'enterprise', label: 'Enterprise' },
  { key: 'custom', label: 'Custom' },
];

// ============ BILLING TYPES ============

export const BILLING_TYPES: { key: string; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' },
  { key: 'one_time_amc', label: 'One-Time + AMC' },
];

// ============ IOT ============

export const IOT_REASON_TYPES: string[] = ['Machine Idle', 'Machine Alarm'];

// ============ NO SERIES ============

export const NO_SERIES_SCREENS: { value: string; label: string }[] = [
  { value: 'Employee', label: 'Employee Onboarding' },
  { value: 'Leave Management', label: 'Leave Management' },
  { value: 'Payroll', label: 'Payroll Run' },
  { value: 'Recruitment', label: 'Recruitment' },
  { value: 'Training', label: 'Training' },
  { value: 'Performance', label: 'Performance Review' },
  { value: 'ESS', label: 'ESS Requests' },
  { value: 'Expense', label: 'Expense Claims' },
  { value: 'Asset', label: 'Asset Management' },
  { value: 'Letter', label: 'HR Letters' },
  { value: 'Offboarding', label: 'Offboarding' },
  { value: 'Production Order', label: 'Production Order' },
  { value: 'Quality Check', label: 'Quality Check' },
  { value: 'Purchase Order', label: 'Purchase Order' },
  { value: 'Goods Receipt', label: 'Goods Receipt Note' },
  { value: 'Stock Transfer', label: 'Stock Transfer' },
  { value: 'Gate Pass', label: 'Gate Pass' },
  { value: 'Visitor', label: 'Visitor Registration' },
  { value: 'Maintenance', label: 'Maintenance Request' },
  { value: 'Support Ticket', label: 'Support Ticket' },
];

// ============ RESERVED SLUGS ============

export const RESERVED_SLUGS: Set<string> = new Set([
  'admin', 'www', 'api', 'app', 'staging', 'dev', 'test', 'demo',
  'mail', 'ftp', 'cdn', 'static', 'assets', 'docs', 'help',
  'support', 'status', 'blog', 'avy-erp-api', 'pg', 'ssh',
]);

// ============ YES/NO PARSING ============

export const YES_NO_MAP: Record<string, boolean> = {
  yes: true,
  y: true,
  '1': true,
  true: true,
  no: false,
  n: false,
  '0': false,
  false: false,
};

// ============ USERS & ACCESS ============

export const USER_ROLES: string[] = [
  'Company Admin', 'HR Manager', 'Plant Manager', 'Employee',
];
