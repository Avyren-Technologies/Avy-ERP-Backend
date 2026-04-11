/**
 * Default seed data for new Indian companies.
 * All records are editable by the company admin after creation.
 * Called during tenant onboarding in tenant.service.ts.
 */

// ── Roles ──
export const DEFAULT_ROLES = [
  {
    name: 'Employee',
    description: 'Standard employee with self-service access to personal HR data',
    permissions: [
      'ess:view-payslips', 'ess:view-leave', 'ess:apply-leave',
      'ess:view-attendance', 'ess:regularize-attendance', 'ess:view-holidays',
      'ess:it-declaration', 'ess:view-directory', 'ess:view-profile',
      'ess:download-form16', 'ess:view-goals', 'ess:submit-appraisal',
      'ess:submit-feedback', 'ess:swap-shift', 'ess:request-wfh',
      'ess:upload-document', 'ess:view-policies', 'ess:claim-expense',
      'ess:view-org-chart', 'ess:view-assets', 'ess:enroll-training',
      'ess:raise-grievance', 'ess:raise-helpdesk', 'ess:apply-loan',
      'ess:use-chatbot', 'ess:view-esign', 'ess:view-disciplinary',
    ],
    isSystem: false,
  },
  {
    name: 'Manager',
    description: 'Team manager with ESS access, team management, approvals, and reporting',
    permissions: [
      'ess:*', 'hr:read', 'hr:approve', 'reports:read',
    ],
    isSystem: false,
  },
];

// ── Departments ──
export const DEFAULT_DEPARTMENTS = [
  { code: 'EXEC', name: 'Executive' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'FIN', name: 'Finance & Accounts' },
  { code: 'OPS', name: 'Operations' },
  { code: 'TECH', name: 'Technology' },
  { code: 'SALES', name: 'Sales & Marketing' },
  { code: 'CS', name: 'Customer Support' },
  { code: 'ADMIN', name: 'Administration' },
];

// ── Grades ──
export const DEFAULT_GRADES = [
  { code: 'G1', name: 'Grade 1 — Entry Level', ctcMin: 300000, ctcMax: 600000, hraPercent: 40, probationMonths: 6, noticeDays: 30 },
  { code: 'G2', name: 'Grade 2 — Junior', ctcMin: 600000, ctcMax: 1200000, hraPercent: 40, probationMonths: 6, noticeDays: 30 },
  { code: 'G3', name: 'Grade 3 — Mid Level', ctcMin: 1200000, ctcMax: 2500000, hraPercent: 50, probationMonths: 3, noticeDays: 60 },
  { code: 'G4', name: 'Grade 4 — Senior', ctcMin: 2500000, ctcMax: 5000000, hraPercent: 50, probationMonths: 3, noticeDays: 90 },
  { code: 'G5', name: 'Grade 5 — Leadership', ctcMin: 5000000, ctcMax: 10000000, hraPercent: 50, probationMonths: 0, noticeDays: 90 },
];

// ── Employee Types ──
export const DEFAULT_EMPLOYEE_TYPES = [
  { code: 'PERM', name: 'Permanent', pfApplicable: true, esiApplicable: true, ptApplicable: true, gratuityEligible: true, bonusEligible: true },
  { code: 'PROB', name: 'Probation', pfApplicable: true, esiApplicable: true, ptApplicable: true, gratuityEligible: false, bonusEligible: false },
  { code: 'CONT', name: 'Contract', pfApplicable: false, esiApplicable: false, ptApplicable: true, gratuityEligible: false, bonusEligible: false },
  { code: 'CONS', name: 'Consultant', pfApplicable: false, esiApplicable: false, ptApplicable: true, gratuityEligible: false, bonusEligible: false },
  { code: 'APPR', name: 'Apprentice', pfApplicable: false, esiApplicable: true, ptApplicable: false, gratuityEligible: false, bonusEligible: false },
  { code: 'TRAIN', name: 'Trainee', pfApplicable: true, esiApplicable: true, ptApplicable: false, gratuityEligible: false, bonusEligible: false },
];

// ── Designations ──
export const DEFAULT_DESIGNATIONS = [
  { code: 'CEO', name: 'Chief Executive Officer', jobLevel: 'L7' as const, managerialFlag: true, probationDays: 0 },
  { code: 'CTO', name: 'Chief Technology Officer', jobLevel: 'L7' as const, managerialFlag: true, probationDays: 0 },
  { code: 'CFO', name: 'Chief Financial Officer', jobLevel: 'L7' as const, managerialFlag: true, probationDays: 0 },
  { code: 'VP', name: 'Vice President', jobLevel: 'L6' as const, managerialFlag: true, probationDays: 0 },
  { code: 'DIR', name: 'Director', jobLevel: 'L6' as const, managerialFlag: true, probationDays: 0 },
  { code: 'SM', name: 'Senior Manager', jobLevel: 'L5' as const, managerialFlag: true, probationDays: 90 },
  { code: 'MGR', name: 'Manager', jobLevel: 'L4' as const, managerialFlag: true, probationDays: 90 },
  { code: 'TL', name: 'Team Lead', jobLevel: 'L4' as const, managerialFlag: true, probationDays: 90 },
  { code: 'SR', name: 'Senior Executive', jobLevel: 'L3' as const, managerialFlag: false, probationDays: 180 },
  { code: 'EXEC', name: 'Executive', jobLevel: 'L2' as const, managerialFlag: false, probationDays: 180 },
  { code: 'JR', name: 'Junior Executive', jobLevel: 'L2' as const, managerialFlag: false, probationDays: 180 },
  { code: 'ASSOC', name: 'Associate', jobLevel: 'L1' as const, managerialFlag: false, probationDays: 180 },
  { code: 'TRAIN', name: 'Trainee', jobLevel: 'L1' as const, managerialFlag: false, probationDays: 180 },
  { code: 'INTERN', name: 'Intern', jobLevel: 'L1' as const, managerialFlag: false, probationDays: 0 },
  { code: 'CONSULT', name: 'Consultant', jobLevel: 'L3' as const, managerialFlag: false, probationDays: 0 },
];

// ── Leave Types (Indian Standard) ──
export const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', category: 'PAID' as const, annualEntitlement: 12, accrualFrequency: 'MONTHLY' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: true, maxConsecutiveDays: 3, weekendSandwich: false, holidaySandwich: false, documentRequired: false, lopOnExcess: true, probationRestricted: false },
  { code: 'SL', name: 'Sick Leave', category: 'PAID' as const, annualEntitlement: 12, accrualFrequency: 'MONTHLY' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: true, maxConsecutiveDays: null, weekendSandwich: false, holidaySandwich: false, documentRequired: true, documentAfterDays: 2, lopOnExcess: true, probationRestricted: false },
  { code: 'EL', name: 'Earned Leave', category: 'PAID' as const, annualEntitlement: 15, accrualFrequency: 'MONTHLY' as const, carryForwardAllowed: true, maxCarryForwardDays: 30, encashmentAllowed: true, maxEncashableDays: 15, encashmentRate: 'Basic', allowHalfDay: false, maxConsecutiveDays: null, weekendSandwich: true, holidaySandwich: true, documentRequired: false, minAdvanceNotice: 15, lopOnExcess: true, probationRestricted: true, minTenureDays: 240 },
  { code: 'ML', name: 'Maternity Leave', category: 'STATUTORY' as const, annualEntitlement: 182, accrualFrequency: 'UPFRONT' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: false, applicableGender: 'Female', documentRequired: true, lopOnExcess: false, probationRestricted: true, minTenureDays: 80 },
  { code: 'PL', name: 'Paternity Leave', category: 'STATUTORY' as const, annualEntitlement: 15, accrualFrequency: 'UPFRONT' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: false, applicableGender: 'Male', documentRequired: true, lopOnExcess: false, probationRestricted: false },
  { code: 'BL', name: 'Bereavement Leave', category: 'PAID' as const, annualEntitlement: 5, accrualFrequency: 'UPFRONT' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: false, maxConsecutiveDays: 5, documentRequired: false, lopOnExcess: false, probationRestricted: false },
  { code: 'CO', name: 'Compensatory Off', category: 'COMPENSATORY' as const, annualEntitlement: 0, accrualFrequency: 'UPFRONT' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: true, documentRequired: false, lopOnExcess: false, probationRestricted: false },
  { code: 'LWP', name: 'Leave Without Pay', category: 'UNPAID' as const, annualEntitlement: 0, accrualFrequency: 'UPFRONT' as const, carryForwardAllowed: false, encashmentAllowed: false, allowHalfDay: true, documentRequired: false, lopOnExcess: false, probationRestricted: false },
];

// ── Holidays (Indian National — 2026) ──
export function getDefaultHolidays(year: number) {
  // Major Indian national and gazetted holidays
  // Dates for variable festivals are approximate for 2026; company admin should adjust
  return [
    { name: 'New Year\'s Day', date: `${year}-01-01`, type: 'COMPANY' as const, description: 'New Year celebration' },
    { name: 'Republic Day', date: `${year}-01-26`, type: 'NATIONAL' as const, description: 'Republic Day of India' },
    { name: 'Holi', date: `${year}-03-04`, type: 'NATIONAL' as const, description: 'Festival of colours' },
    { name: 'Good Friday', date: `${year}-04-03`, type: 'NATIONAL' as const, description: 'Good Friday' },
    { name: 'Eid-ul-Fitr', date: `${year}-03-21`, type: 'NATIONAL' as const, description: 'End of Ramadan' },
    { name: 'May Day', date: `${year}-05-01`, type: 'NATIONAL' as const, description: 'International Workers\' Day' },
    { name: 'Eid-ul-Adha', date: `${year}-06-07`, type: 'NATIONAL' as const, description: 'Festival of sacrifice' },
    { name: 'Independence Day', date: `${year}-08-15`, type: 'NATIONAL' as const, description: 'Independence Day of India' },
    { name: 'Janmashtami', date: `${year}-08-14`, type: 'NATIONAL' as const, description: 'Birth of Lord Krishna' },
    { name: 'Gandhi Jayanti', date: `${year}-10-02`, type: 'NATIONAL' as const, description: 'Mahatma Gandhi\'s birthday' },
    { name: 'Dussehra', date: `${year}-10-12`, type: 'NATIONAL' as const, description: 'Victory of good over evil' },
    { name: 'Diwali', date: `${year}-10-31`, type: 'NATIONAL' as const, description: 'Festival of lights' },
    { name: 'Diwali (Day 2)', date: `${year}-11-01`, type: 'COMPANY' as const, description: 'Diwali holiday continued' },
    { name: 'Guru Nanak Jayanti', date: `${year}-11-15`, type: 'NATIONAL' as const, description: 'Birth of Guru Nanak' },
    { name: 'Christmas', date: `${year}-12-25`, type: 'NATIONAL' as const, description: 'Christmas Day' },
  ];
}

// ── Salary Components ──
export const DEFAULT_SALARY_COMPONENTS = [
  // Earnings
  { code: 'BASIC', name: 'Basic Salary', type: 'EARNING' as const, calculationMethod: 'PERCENT_OF_GROSS' as const, formulaValue: 40, taxable: 'FULLY_TAXABLE' as const, pfInclusion: true, esiInclusion: true, gratuityInclusion: true, bonusInclusion: true, payslipOrder: 1 },
  { code: 'HRA', name: 'House Rent Allowance', type: 'EARNING' as const, calculationMethod: 'PERCENT_OF_BASIC' as const, formulaValue: 50, taxable: 'PARTIALLY_EXEMPT' as const, exemptionSection: 'Section 10(13A)', pfInclusion: false, esiInclusion: true, payslipOrder: 2 },
  { code: 'DA', name: 'Dearness Allowance', type: 'EARNING' as const, calculationMethod: 'PERCENT_OF_BASIC' as const, formulaValue: 10, taxable: 'FULLY_TAXABLE' as const, pfInclusion: true, esiInclusion: true, gratuityInclusion: true, payslipOrder: 3 },
  { code: 'CONV', name: 'Conveyance Allowance', type: 'EARNING' as const, calculationMethod: 'FIXED' as const, taxable: 'PARTIALLY_EXEMPT' as const, exemptionSection: 'Section 10(14)', exemptionLimit: 19200, pfInclusion: false, esiInclusion: true, payslipOrder: 4 },
  { code: 'MED', name: 'Medical Allowance', type: 'EARNING' as const, calculationMethod: 'FIXED' as const, taxable: 'PARTIALLY_EXEMPT' as const, exemptionLimit: 15000, pfInclusion: false, esiInclusion: true, payslipOrder: 5 },
  { code: 'SPAL', name: 'Special Allowance', type: 'EARNING' as const, calculationMethod: 'FIXED' as const, taxable: 'FULLY_TAXABLE' as const, pfInclusion: false, esiInclusion: true, payslipOrder: 6 },
  { code: 'PERF', name: 'Performance Bonus', type: 'EARNING' as const, calculationMethod: 'FIXED' as const, taxable: 'FULLY_TAXABLE' as const, pfInclusion: false, esiInclusion: false, payslipOrder: 7 },
  // Deductions
  { code: 'PF_EE', name: 'Provident Fund (Employee)', type: 'DEDUCTION' as const, calculationMethod: 'PERCENT_OF_BASIC' as const, formulaValue: 12, taxable: 'FULLY_EXEMPT' as const, payslipOrder: 10 },
  { code: 'ESI_EE', name: 'ESI (Employee)', type: 'DEDUCTION' as const, calculationMethod: 'PERCENT_OF_GROSS' as const, formulaValue: 0.75, taxable: 'FULLY_EXEMPT' as const, payslipOrder: 11 },
  { code: 'PT', name: 'Professional Tax', type: 'DEDUCTION' as const, calculationMethod: 'FIXED' as const, taxable: 'FULLY_EXEMPT' as const, exemptionSection: 'Section 16(iii)', payslipOrder: 12 },
  { code: 'TDS', name: 'Income Tax (TDS)', type: 'DEDUCTION' as const, calculationMethod: 'FORMULA' as const, taxable: 'FULLY_EXEMPT' as const, payslipOrder: 13 },
  // Employer contributions
  { code: 'PF_ER', name: 'Provident Fund (Employer)', type: 'EMPLOYER_CONTRIBUTION' as const, calculationMethod: 'PERCENT_OF_BASIC' as const, formulaValue: 12, taxable: 'FULLY_EXEMPT' as const, showOnPayslip: false, payslipOrder: 20 },
  { code: 'ESI_ER', name: 'ESI (Employer)', type: 'EMPLOYER_CONTRIBUTION' as const, calculationMethod: 'PERCENT_OF_GROSS' as const, formulaValue: 3.25, taxable: 'FULLY_EXEMPT' as const, showOnPayslip: false, payslipOrder: 21 },
];

// ── Loan Policies ──
export const DEFAULT_LOAN_POLICIES = [
  { code: 'PERSONAL', name: 'Personal Loan', loanType: 'PERSONAL', maxAmount: 500000, maxTenureMonths: 36, interestRate: 8, emiCapPercent: 40, eligibilityTenureDays: 365 },
  { code: 'SAL_ADV', name: 'Salary Advance', loanType: 'SALARY_ADVANCE', maxAmount: 100000, maxTenureMonths: 6, interestRate: 0, emiCapPercent: 50, eligibilityTenureDays: 90 },
  { code: 'EMERG', name: 'Emergency Loan', loanType: 'EMERGENCY', maxAmount: 200000, maxTenureMonths: 12, interestRate: 0, emiCapPercent: 30, eligibilityTenureDays: 30 },
  { code: 'EDU', name: 'Education Loan', loanType: 'EDUCATION', maxAmount: 300000, maxTenureMonths: 48, interestRate: 6, emiCapPercent: 30, eligibilityTenureDays: 365 },
  { code: 'VEHICLE', name: 'Vehicle Loan', loanType: 'VEHICLE', maxAmount: 800000, maxTenureMonths: 60, interestRate: 9, emiCapPercent: 40, eligibilityTenureDays: 365 },
];

// ── Asset Categories ──
export const DEFAULT_ASSET_CATEGORIES = [
  { name: 'Laptop', depreciationRate: 33.33 },
  { name: 'Desktop Computer', depreciationRate: 33.33 },
  { name: 'Mobile Phone', depreciationRate: 33.33 },
  { name: 'Furniture', depreciationRate: 10 },
  { name: 'Vehicle', depreciationRate: 15 },
  { name: 'Access Card / ID Badge', depreciationRate: 0 },
];

// ── Grievance Categories ──
export const DEFAULT_GRIEVANCE_CATEGORIES = [
  { name: 'Workplace Harassment', slaHours: 48 },
  { name: 'Pay & Compensation Dispute', slaHours: 72 },
  { name: 'Leave & Attendance Issue', slaHours: 48 },
  { name: 'Discrimination', slaHours: 48 },
  { name: 'Workplace Safety', slaHours: 24 },
  { name: 'Manager Conduct', slaHours: 72 },
  { name: 'Policy & Process', slaHours: 96 },
];

// ── Default Expense Categories ──
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Travel', code: 'TRAVEL', description: 'Air/train/bus fare, taxi, cab charges', requiresReceipt: true },
  { name: 'Food & Beverages', code: 'FOOD', description: 'Meals, refreshments during official work', requiresReceipt: false, receiptThreshold: 500 },
  { name: 'Accommodation', code: 'ACCOMMODATION', description: 'Hotel/lodge stays for official travel', requiresReceipt: true },
  { name: 'Fuel', code: 'FUEL', description: 'Petrol/diesel for official travel using own vehicle', requiresReceipt: true },
  { name: 'Phone & Internet', code: 'PHONE_INTERNET', description: 'Mobile bills, internet charges for work', requiresReceipt: true },
  { name: 'Office Supplies', code: 'OFFICE_SUPPLIES', description: 'Stationery, printing, courier charges', requiresReceipt: true },
  { name: 'Medical', code: 'MEDICAL', description: 'Medical expenses eligible for reimbursement', requiresReceipt: true },
  { name: 'Uniform & Dress', code: 'UNIFORM', description: 'Uniform and dress allowance claims', requiresReceipt: true },
  { name: 'Business Entertainment', code: 'BUSINESS', description: 'Client entertainment, gifts, hospitality', requiresReceipt: true },
  { name: 'Mileage', code: 'MILEAGE', description: 'Per-km reimbursement for own vehicle usage', requiresReceipt: false },
  { name: 'Other', code: 'OTHER', description: 'Miscellaneous expenses not covered above', requiresReceipt: true },
];

// ── Approval Workflows ──
export const DEFAULT_APPROVAL_WORKFLOWS = [
  { name: 'Leave Approval', triggerEvent: 'LEAVE_APPLICATION', steps: [{ stepOrder: 1, approverRole: 'MANAGER', slaHours: 24, autoEscalate: true }] },
  { name: 'Attendance Regularization', triggerEvent: 'ATTENDANCE_REGULARIZATION', steps: [{ stepOrder: 1, approverRole: 'MANAGER', slaHours: 48, autoEscalate: true }] },
  { name: 'Overtime Approval', triggerEvent: 'OVERTIME_CLAIM', steps: [{ stepOrder: 1, approverRole: 'MANAGER', slaHours: 48, autoEscalate: true }] },
  { name: 'Expense Reimbursement', triggerEvent: 'REIMBURSEMENT', steps: [{ stepOrder: 1, approverRole: 'MANAGER', slaHours: 48, autoEscalate: true }, { stepOrder: 2, approverRole: 'FINANCE', slaHours: 72, autoEscalate: true }] },
  { name: 'Loan Application', triggerEvent: 'LOAN_APPLICATION', steps: [{ stepOrder: 1, approverRole: 'MANAGER', slaHours: 48, autoEscalate: true }, { stepOrder: 2, approverRole: 'HR', slaHours: 72, autoEscalate: true }, { stepOrder: 3, approverRole: 'FINANCE', slaHours: 96, autoEscalate: true }] },
];

// ── Notification Templates ──
// `code` must be unique per (companyId, channel) — used by @@unique([companyId, code, channel])
export const DEFAULT_NOTIFICATION_TEMPLATES = [
  { code: 'LEAVE_APPLIED', name: 'Leave Applied', subject: 'Leave Application from {employee_name}', body: 'Dear {manager_name},\n\n{employee_name} has applied for {leave_type} from {from_date} to {to_date} ({leave_days} days).\n\nPlease review and approve/reject the request.\n\nRegards,\nHR Team', channel: 'EMAIL' as const },
  { code: 'LEAVE_APPROVED', name: 'Leave Approved', subject: 'Leave Approved — {leave_type}', body: 'Dear {employee_name},\n\nYour {leave_type} request from {from_date} to {to_date} has been approved by {approver_name}.\n\nRegards,\nHR Team', channel: 'EMAIL' as const },
  { code: 'LEAVE_REJECTED', name: 'Leave Rejected', subject: 'Leave Rejected — {leave_type}', body: 'Dear {employee_name},\n\nYour {leave_type} request from {from_date} to {to_date} has been rejected by {approver_name}.\n\nReason: {rejection_reason}\n\nRegards,\nHR Team', channel: 'EMAIL' as const },
  { code: 'PAYSLIP_PUBLISHED', name: 'Payslip Published', subject: 'Payslip for {month_year} Available', body: 'Dear {employee_name},\n\nYour payslip for {month_year} is now available. Please log in to the ESS portal to view and download.\n\nRegards,\nPayroll Team', channel: 'EMAIL' as const },
  { code: 'ATTENDANCE_REMINDER', name: 'Attendance Reminder', subject: 'Missing Attendance — {date}', body: 'Dear {employee_name},\n\nYour attendance for {date} is not recorded. Please regularize your attendance through the ESS portal.\n\nRegards,\nHR Team', channel: 'IN_APP' as const },
  { code: 'BIRTHDAY_WISH', name: 'Birthday Wish', subject: 'Happy Birthday, {employee_name}!', body: 'Dear {employee_name},\n\nWishing you a very happy birthday! May this year bring you success and happiness.\n\nWarm regards,\n{company_name} Team', channel: 'EMAIL' as const },
  { code: 'WORK_ANNIVERSARY', name: 'Work Anniversary', subject: 'Happy Work Anniversary, {employee_name}!', body: 'Dear {employee_name},\n\nCongratulations on completing {years} year(s) with {company_name}! Thank you for your dedication and contributions.\n\nRegards,\n{company_name} Team', channel: 'EMAIL' as const },
  { code: 'PROBATION_REVIEW_DUE', name: 'Probation Review Due', subject: 'Probation Review Due — {employee_name}', body: 'Dear {manager_name},\n\nThe probation period for {employee_name} is ending on {end_date}. Please schedule a review and confirm their status.\n\nRegards,\nHR Team', channel: 'EMAIL' as const },
];

// ── Notification Rules ──
export const DEFAULT_NOTIFICATION_RULES = [
  { triggerEvent: 'LEAVE_APPLICATION', recipientRole: 'MANAGER', channel: 'EMAIL' as const, templateName: 'Leave Applied' },
  { triggerEvent: 'LEAVE_APPROVED', recipientRole: 'EMPLOYEE', channel: 'EMAIL' as const, templateName: 'Leave Approved' },
  { triggerEvent: 'LEAVE_REJECTED', recipientRole: 'EMPLOYEE', channel: 'EMAIL' as const, templateName: 'Leave Rejected' },
  { triggerEvent: 'PAYSLIP_PUBLISHED', recipientRole: 'EMPLOYEE', channel: 'EMAIL' as const, templateName: 'Payslip Published' },
  { triggerEvent: 'MISSING_ATTENDANCE', recipientRole: 'EMPLOYEE', channel: 'IN_APP' as const, templateName: 'Attendance Reminder' },
  { triggerEvent: 'BIRTHDAY', recipientRole: 'EMPLOYEE', channel: 'EMAIL' as const, templateName: 'Birthday Wish' },
  { triggerEvent: 'WORK_ANNIVERSARY', recipientRole: 'EMPLOYEE', channel: 'EMAIL' as const, templateName: 'Work Anniversary' },
  { triggerEvent: 'PROBATION_REVIEW', recipientRole: 'MANAGER', channel: 'EMAIL' as const, templateName: 'Probation Review Due' },
];

// ── Tax Config (FY 2025-26 India) ──
export const DEFAULT_TAX_CONFIG = {
  defaultRegime: 'NEW' as const,
  newRegimeSlabs: [
    { fromAmount: 0, toAmount: 400000, rate: 0 },
    { fromAmount: 400001, toAmount: 800000, rate: 5 },
    { fromAmount: 800001, toAmount: 1200000, rate: 10 },
    { fromAmount: 1200001, toAmount: 1600000, rate: 15 },
    { fromAmount: 1600001, toAmount: 2000000, rate: 20 },
    { fromAmount: 2000001, toAmount: 2400000, rate: 25 },
    { fromAmount: 2400001, toAmount: null, rate: 30 },
  ],
  oldRegimeSlabs: [
    { fromAmount: 0, toAmount: 250000, rate: 0 },
    { fromAmount: 250001, toAmount: 500000, rate: 5 },
    { fromAmount: 500001, toAmount: 1000000, rate: 20 },
    { fromAmount: 1000001, toAmount: null, rate: 30 },
  ],
  cessRate: 4,
};

// ── Rosters ──
export const DEFAULT_ROSTERS = [
  { name: 'Standard (Mon-Fri)', pattern: 'MON_FRI' as const, weekOff1: 'Saturday', weekOff2: 'Sunday', isDefault: true },
  { name: '6-Day Week (Mon-Sat)', pattern: 'MON_SAT' as const, weekOff1: 'Sunday', weekOff2: null, isDefault: false },
  { name: 'Alternate Saturday', pattern: 'MON_SAT_ALT' as const, weekOff1: 'Sunday', weekOff2: 'Saturday', isDefault: false },
];
