// ══════════════════════════════════════════════════════════════════════
// LINKED SCREENS — Single source of truth for Number Series targets
// ══════════════════════════════════════════════════════════════════════
//
// Every Number Series record has a `linkedScreen` field that ties it to
// a specific business entity. The `generateNextNumber()` utility matches
// on this value to find the right series at runtime.
//
// HOW TO ADD A NEW LINKED SCREEN:
// 1. Add an entry to LINKED_SCREENS below with value, label, module,
//    description, and a suggested default prefix.
// 2. In your service, call:
//      generateNextNumber(tx, companyId, 'Your Value', 'Entity Label')
//    You can also pass an array of aliases for backwards-compat:
//      generateNextNumber(tx, companyId, ['Gate Pass', 'Visitor Gate Pass'], 'Gate Pass')
// 3. That's it — the frontend dropdown auto-populates from the
//    GET /company/no-series/linked-screens endpoint.
// ══════════════════════════════════════════════════════════════════════

export interface LinkedScreenOption {
  /** Exact value stored in NoSeriesConfig.linkedScreen */
  value: string;
  /** Human-readable label for UI dropdown */
  label: string;
  /** Module this screen belongs to (for grouping in UI) */
  module: string;
  /** Brief explanation shown as helper text */
  description: string;
  /** Suggested default prefix when creating a new series */
  defaultPrefix: string;
}

/**
 * All valid linked screen values.
 *
 * The `value` field is what gets stored in the DB and matched by
 * `generateNextNumber()`. Keep values stable — renaming requires a
 * data migration.
 */
export const LINKED_SCREENS: readonly LinkedScreenOption[] = [
  // ── HR / Employee ──────────────────────────────────────────────────
  {
    value: 'Employee',
    label: 'Employee Onboarding',
    module: 'HR',
    description: 'Auto-generates Employee IDs (e.g. EMP00001)',
    defaultPrefix: 'EMP',
  },

  // ── HR / Leave ─────────────────────────────────────────────────────
  {
    value: 'Leave Management',
    label: 'Leave Management',
    module: 'HR',
    description: 'Reference numbers for leave requests (e.g. LV-00001)',
    defaultPrefix: 'LV-',
  },

  // ── HR / Payroll ───────────────────────────────────────────────────
  {
    value: 'Payroll',
    label: 'Payroll Run',
    module: 'HR',
    description: 'Reference numbers for payroll runs (e.g. PR-00001)',
    defaultPrefix: 'PR-',
  },

  // ── HR / Recruitment ───────────────────────────────────────────────
  {
    value: 'Recruitment',
    label: 'Recruitment',
    module: 'HR',
    description: 'Reference numbers for job postings and applications',
    defaultPrefix: 'REC-',
  },

  // ── HR / Training ──────────────────────────────────────────────────
  {
    value: 'Training',
    label: 'Training',
    module: 'HR',
    description: 'Reference numbers for training programs and sessions',
    defaultPrefix: 'TRN-',
  },

  // ── HR / Training Program ──────────────────────────────────────────
  {
    value: 'Training Program',
    label: 'Training Program',
    module: 'HR',
    description: 'Reference numbers for training programs',
    defaultPrefix: 'PRG-',
  },

  // ── HR / Training Session ──────────────────────────────────────────
  {
    value: 'Training Session',
    label: 'Training Session',
    module: 'HR',
    description: 'Reference numbers for training sessions',
    defaultPrefix: 'TSN-',
  },

  // ── HR / Offer Management ────────────────────────────────────────────
  {
    value: 'Offer Management',
    label: 'Offer Management',
    module: 'HR',
    description: 'Reference numbers for job offers',
    defaultPrefix: 'OFR-',
  },

  // ── HR / Performance ───────────────────────────────────────────────
  {
    value: 'Performance',
    label: 'Performance Review',
    module: 'HR',
    description: 'Reference numbers for performance review cycles',
    defaultPrefix: 'PFM-',
  },

  // ── HR / ESS Workflows ─────────────────────────────────────────────
  {
    value: 'ESS',
    label: 'ESS Requests',
    module: 'HR',
    description: 'Reference numbers for employee self-service requests',
    defaultPrefix: 'ESS-',
  },

  // ── HR / Expense ───────────────────────────────────────────────────
  {
    value: 'Expense',
    label: 'Expense Claims',
    module: 'HR',
    description: 'Reference numbers for expense claims and reimbursements',
    defaultPrefix: 'EXP-',
  },

  // ── HR / Assets ────────────────────────────────────────────────────
  {
    value: 'Asset',
    label: 'Asset Management',
    module: 'HR',
    description: 'Reference numbers for company asset assignments',
    defaultPrefix: 'AST-',
  },

  // ── HR / Letters ───────────────────────────────────────────────────
  {
    value: 'Letter',
    label: 'HR Letters',
    module: 'HR',
    description: 'Reference numbers for offer letters, appointment letters, etc.',
    defaultPrefix: 'LTR-',
  },

  // ── HR / Offboarding ──────────────────────────────────────────────
  {
    value: 'Offboarding',
    label: 'Offboarding',
    module: 'HR',
    description: 'Reference numbers for offboarding and F&F processes',
    defaultPrefix: 'OFB-',
  },

  // ── Production ────────────────────────────────────────────────────
  {
    value: 'Production Order',
    label: 'Production Order',
    module: 'Production',
    description: 'Reference numbers for production/work orders',
    defaultPrefix: 'PO-',
  },

  {
    value: 'Quality Check',
    label: 'Quality Check',
    module: 'Production',
    description: 'Reference numbers for QC inspection reports',
    defaultPrefix: 'QC-',
  },

  // ── Inventory ─────────────────────────────────────────────────────
  {
    value: 'Purchase Order',
    label: 'Purchase Order',
    module: 'Inventory',
    description: 'Reference numbers for purchase orders',
    defaultPrefix: 'PUR-',
  },

  {
    value: 'Goods Receipt',
    label: 'Goods Receipt Note',
    module: 'Inventory',
    description: 'Reference numbers for goods receipt notes (GRN)',
    defaultPrefix: 'GRN-',
  },

  {
    value: 'Stock Transfer',
    label: 'Stock Transfer',
    module: 'Inventory',
    description: 'Reference numbers for inter-warehouse stock transfers',
    defaultPrefix: 'STK-',
  },

  // ── Visitors / Gate Pass ──────────────────────────────────────────
  {
    value: 'Gate Pass',
    label: 'Gate Pass',
    module: 'Visitors',
    description: 'Reference numbers for visitor gate passes',
    defaultPrefix: 'GP-',
  },

  {
    value: 'Visitor',
    label: 'Visitor Registration',
    module: 'Visitors',
    description: 'Reference numbers for visitor registrations',
    defaultPrefix: 'VIS-',
  },
  {
    value: 'Visitor Badge',
    label: 'Visitor Badge',
    module: 'Visitors',
    description: 'Reference numbers for visitor badges',
    defaultPrefix: 'B-',
  },
  {
    value: 'Recurring Visitor Pass',
    label: 'Recurring Visitor Pass',
    module: 'Visitors',
    description: 'Reference numbers for recurring visitor passes',
    defaultPrefix: 'RP-',
  },
  {
    value: 'Vehicle Gate Pass',
    label: 'Vehicle Gate Pass',
    module: 'Visitors',
    description: 'Reference numbers for vehicle gate passes',
    defaultPrefix: 'VGP-',
  },
  {
    value: 'Material Gate Pass',
    label: 'Material Gate Pass',
    module: 'Visitors',
    description: 'Reference numbers for material gate passes',
    defaultPrefix: 'MGP-',
  },
  {
    value: 'Group Visit',
    label: 'Group Visit',
    module: 'Visitors',
    description: 'Reference numbers for group visits',
    defaultPrefix: 'GV-',
  },

  // ── Maintenance ───────────────────────────────────────────────────
  {
    value: 'Maintenance',
    label: 'Maintenance Request',
    module: 'Maintenance',
    description: 'Reference numbers for maintenance work orders',
    defaultPrefix: 'MNT-',
  },

  // ── Support ───────────────────────────────────────────────────────
  {
    value: 'Support Ticket',
    label: 'Support Ticket',
    module: 'Support',
    description: 'Reference numbers for internal support tickets',
    defaultPrefix: 'TKT-',
  },
] as const;

/** Set of all valid linkedScreen values — used for fast validation */
export const VALID_LINKED_SCREEN_VALUES = new Set(
  LINKED_SCREENS.map((s) => s.value),
);

/**
 * Check whether a string is a valid linked screen value.
 * Used by validators and the service layer.
 */
export function isValidLinkedScreen(value: string): boolean {
  return VALID_LINKED_SCREEN_VALUES.has(value);
}
