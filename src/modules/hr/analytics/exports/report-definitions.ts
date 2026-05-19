// ─── Report Definitions — Metadata for all 25 reports ───

export interface ReportDefinition {
  key: string;
  title: string;
  category: string;
  sheetNames: string[];
  requiredPermission: string;
}

export const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
  // ── Workforce Reports (R01–R03) ──
  'employee-master': {
    key: 'employee-master',
    title: 'Employee Master Report',
    category: 'Workforce',
    sheetNames: ['Summary', 'Employee Details'],
    requiredPermission: 'hr:read',
  },
  'headcount-movement': {
    key: 'headcount-movement',
    title: 'Headcount Movement Report',
    category: 'Workforce',
    sheetNames: ['Summary', 'Joiners', 'Leavers', 'Transfers', 'Promotions'],
    requiredPermission: 'hr:read',
  },
  demographics: {
    key: 'demographics',
    title: 'Demographics Report',
    category: 'Workforce',
    sheetNames: ['Gender', 'Age Distribution', 'Tenure Distribution'],
    requiredPermission: 'hr:read',
  },

  // ── Attendance Reports (R04–R07) ──
  'attendance-register': {
    key: 'attendance-register',
    title: 'Attendance Register',
    category: 'Attendance',
    sheetNames: ['Summary', 'Day-wise Grid'],
    requiredPermission: 'hr:read',
  },
  'late-coming': {
    key: 'late-coming',
    title: 'Late Coming Report',
    category: 'Attendance',
    sheetNames: ['Summary', 'Detail', 'Frequency'],
    requiredPermission: 'hr:read',
  },
  overtime: {
    key: 'overtime',
    title: 'Overtime Report',
    category: 'Attendance',
    sheetNames: ['Summary', 'Detail', 'Cost Analysis'],
    requiredPermission: 'hr:read',
  },
  absenteeism: {
    key: 'absenteeism',
    title: 'Absenteeism Report',
    category: 'Attendance',
    sheetNames: ['Summary', 'Detail', 'Frequent Absentees'],
    requiredPermission: 'hr:read',
  },

  // ── Leave Reports (R08–R10) ──
  'leave-balance': {
    key: 'leave-balance',
    title: 'Leave Balance Report',
    category: 'Leave',
    sheetNames: ['Summary by Type', 'By Employee'],
    requiredPermission: 'hr:read',
  },
  'leave-utilization': {
    key: 'leave-utilization',
    title: 'Leave Utilization Report',
    category: 'Leave',
    sheetNames: ['Summary', 'Monthly Trend', 'By Department'],
    requiredPermission: 'hr:read',
  },
  'leave-encashment': {
    key: 'leave-encashment',
    title: 'Leave Encashment Report',
    category: 'Leave',
    sheetNames: ['Summary', 'Employee Detail'],
    requiredPermission: 'hr:export',
  },

  // ── Payroll Reports (R11–R15) ──
  'salary-register': {
    key: 'salary-register',
    title: 'Salary Register',
    category: 'Payroll',
    sheetNames: ['Summary', 'Earnings', 'Deductions', 'Net Pay', 'Employer Cost'],
    requiredPermission: 'hr:export',
  },
  'bank-transfer': {
    key: 'bank-transfer',
    title: 'Bank Transfer File',
    category: 'Payroll',
    sheetNames: ['NEFT Transfer'],
    requiredPermission: 'hr:export',
  },
  'ctc-distribution': {
    key: 'ctc-distribution',
    title: 'CTC Distribution Report',
    category: 'Payroll',
    sheetNames: ['Summary', 'By Grade', 'By Department', 'CTC Bands'],
    requiredPermission: 'hr:export',
  },
  'salary-revision': {
    key: 'salary-revision',
    title: 'Salary Revision Report',
    category: 'Payroll',
    sheetNames: ['Summary', 'Detail'],
    requiredPermission: 'hr:export',
  },
  'loan-outstanding': {
    key: 'loan-outstanding',
    title: 'Loan Outstanding Report',
    category: 'Payroll',
    sheetNames: ['Summary', 'Active Loans', 'EMI Schedule'],
    requiredPermission: 'hr:export',
  },

  // ── Statutory Reports (R16–R20) ──
  'pf-ecr': {
    key: 'pf-ecr',
    title: 'PF ECR Report',
    category: 'Statutory',
    sheetNames: ['ECR Format', 'Summary'],
    requiredPermission: 'hr:export',
  },
  'esi-challan': {
    key: 'esi-challan',
    title: 'ESI Challan Report',
    category: 'Statutory',
    sheetNames: ['Challan Format', 'Summary'],
    requiredPermission: 'hr:export',
  },
  'professional-tax': {
    key: 'professional-tax',
    title: 'Professional Tax Report',
    category: 'Statutory',
    sheetNames: ['State-wise', 'Detail'],
    requiredPermission: 'hr:export',
  },
  'tds-summary': {
    key: 'tds-summary',
    title: 'TDS Summary Report',
    category: 'Statutory',
    sheetNames: ['Quarterly Summary', 'Detail'],
    requiredPermission: 'hr:export',
  },
  'gratuity-liability': {
    key: 'gratuity-liability',
    title: 'Gratuity Liability Report',
    category: 'Statutory',
    sheetNames: ['Summary', 'Detail'],
    requiredPermission: 'hr:export',
  },

  // ── Performance Reports (R21–R22) ──
  'appraisal-summary': {
    key: 'appraisal-summary',
    title: 'Appraisal Summary Report',
    category: 'Performance',
    sheetNames: ['Summary', 'Bell Curve', 'Detail'],
    requiredPermission: 'hr:read',
  },
  'skill-gap': {
    key: 'skill-gap',
    title: 'Skill Gap Report',
    category: 'Performance',
    sheetNames: ['Summary', 'Heatmap', 'Detail'],
    requiredPermission: 'hr:read',
  },

  // ── Attrition Reports (R23–R24) ──
  attrition: {
    key: 'attrition',
    title: 'Attrition Report',
    category: 'Attrition',
    sheetNames: ['Summary', 'By Department', 'By Reason', 'Detail'],
    requiredPermission: 'hr:read',
  },
  'fnf-settlement': {
    key: 'fnf-settlement',
    title: 'Full & Final Settlement Report',
    category: 'Attrition',
    sheetNames: ['Summary', 'Pending', 'Completed'],
    requiredPermission: 'hr:export',
  },

  // ── Production Reports (R26–R32) ──
  'pip-daily-production': {
    key: 'pip-daily-production',
    title: 'PIP Daily Production Report',
    category: 'Production',
    sheetNames: ['Summary', 'Operator Detail', 'Machine Utilization'],
    requiredPermission: 'production.pip:export',
  },
  'pip-incentive-summary': {
    key: 'pip-incentive-summary',
    title: 'PIP Incentive Summary Report',
    category: 'Production',
    sheetNames: ['Monthly Summary', 'Operator-wise', 'Part-wise', 'Daily Trend', 'Operation-wise'],
    requiredPermission: 'production.pip:export',
  },
  'pip-operator-performance': {
    key: 'pip-operator-performance',
    title: 'PIP Operator Performance Report',
    category: 'Production',
    sheetNames: ['Summary', 'Detail', 'Achievement Trend'],
    requiredPermission: 'production.pip:export',
  },
  'pip-machine-utilization': {
    key: 'pip-machine-utilization',
    title: 'PIP Machine Utilization Report',
    category: 'Production',
    sheetNames: ['Summary', 'Machine-wise', 'Shift Analysis', 'Downtime Analysis'],
    requiredPermission: 'production.pip:export',
  },
  'pip-shift-productivity': {
    key: 'pip-shift-productivity',
    title: 'PIP Shift Productivity Report',
    category: 'Production',
    sheetNames: ['Summary', 'Shift Comparison', 'Trend'],
    requiredPermission: 'production.pip:export',
  },
  'pip-payroll-merge': {
    key: 'pip-payroll-merge',
    title: 'PIP Payroll Merge Report',
    category: 'Production',
    sheetNames: ['Merge Summary', 'Employee Detail'],
    requiredPermission: 'production.pip:export',
  },
  'pip-exception': {
    key: 'pip-exception',
    title: 'PIP Exception Report',
    category: 'Production',
    sheetNames: ['Below Target', 'Missing Entries', 'Duplicates', 'High Downtime'],
    requiredPermission: 'production.pip:export',
  },
  'pip-slab-config': {
    key: 'pip-slab-config',
    title: 'PIP Slab Configuration Report',
    category: 'Production',
    sheetNames: ['Config Summary', 'Tier Details'],
    requiredPermission: 'production.pip:export',
  },

  // ── Compliance Report (R25) ──
  'compliance-summary': {
    key: 'compliance-summary',
    title: 'Compliance Summary Report',
    category: 'Compliance',
    sheetNames: ['Score', 'Filings', 'Grievances', 'Document Status'],
    requiredPermission: 'hr:export',
  },
};

export const VALID_REPORT_TYPES = Object.keys(REPORT_DEFINITIONS);

export const REPORT_DESCRIPTIONS: Record<string, string> = {
  'employee-master': 'Complete employee directory with personal, professional, and compensation details',
  'headcount-movement': 'Monthly joiners, leavers, transfers, and promotions with net headcount change',
  demographics: 'Workforce distribution by gender, age band, and tenure',
  'attendance-register': 'Day-wise attendance grid for all employees with status codes',
  'late-coming': 'Late arrival analysis with frequency tracking and department breakdown',
  overtime: 'Overtime hours and cost analysis by employee, department, and shift',
  absenteeism: 'Absence patterns, frequent absentees, and trend analysis',
  'leave-balance': 'Current leave balances by type and employee with carry-forward details',
  'leave-utilization': 'Leave consumption patterns by type, department, and month',
  'leave-encashment': 'Leave encashment liability calculation per eligible employee',
  'salary-register': 'Complete payroll breakup — earnings, deductions, net pay, and employer cost',
  'bank-transfer': 'Bank-ready NEFT/RTGS file with account details and net pay amounts',
  'ctc-distribution': 'CTC analysis by grade, department, and salary bands',
  'salary-revision': 'Salary revision history with old/new CTC and increment percentages',
  'loan-outstanding': 'Active employee loans with EMI schedule and outstanding amounts',
  'pf-ecr': 'EPFO Electronic Challan cum Return with UAN-wise contributions',
  'esi-challan': 'ESI contribution challan with IP number and wage details',
  'professional-tax': 'State-wise professional tax deductions and slab compliance',
  'tds-summary': 'Quarterly TDS summary with regime-wise breakdown and declarations',
  'gratuity-liability': 'Projected gratuity liability for eligible employees (4+ years)',
  'appraisal-summary': 'Appraisal cycle results — ratings, bell curve, and department averages',
  'skill-gap': 'Required vs actual skill levels with gap analysis by department',
  attrition: 'Attrition analysis — rates, reasons, department trends, and early exits',
  'fnf-settlement': 'Full & final settlement status — pending and completed with breakdowns',
  'compliance-summary': 'Overall compliance health — filing status, grievances, and document gaps',
  'pip-daily-production': 'Daily production output and incentive summary by operator and machine for a selected date and shift',
  'pip-incentive-summary': 'Monthly incentive consolidation with operator-wise, part-wise breakdowns and daily trend for payroll processing',
  'pip-operator-performance': 'Operator performance analysis including achievement rates, eligibility trends, and incentive earnings over time',
  'pip-machine-utilization': 'Machine-level production analysis showing utilization rates, output volumes, and shift-wise productivity',
  'pip-shift-productivity': 'Shift comparison report analyzing production output, incentive distribution, and target achievement across shifts',
  'pip-payroll-merge': 'Audit report of incentive amounts merged into payroll runs with employee-wise breakdown',
  'pip-exception': 'Exception report highlighting below-target operators, missing production entries, and duplicate submissions',
  'pip-slab-config': 'Current slab configurations with machine-operation-part breakdown and tier details',
};
