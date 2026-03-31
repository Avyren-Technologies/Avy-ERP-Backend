import { Router } from 'express';
import { orgStructureRoutes } from './org-structure/org-structure.routes';
import { employeeRoutes } from './employee/employee.routes';
import { attendanceRoutes } from './attendance/attendance.routes';
import { leaveRoutes } from './leave/leave.routes';
import { payrollRoutes } from './payroll/payroll.routes';
import { payrollRunRoutes } from './payroll-run/payroll-run.routes';
import { essRoutes } from './ess/ess.routes';
import { performanceRoutes } from './performance/performance.routes';
import { offboardingRoutes } from './offboarding/offboarding.routes';
import { advancedRoutes } from './advanced/advanced.routes';
import { transferRoutes } from './transfer/transfer.routes';
import { onboardingRoutes } from './onboarding/onboarding.routes';
import { chatbotRoutes } from './chatbot/chatbot.routes';
import { retentionRoutes } from './retention/retention.routes';
import { analyticsRoutes } from './analytics/analytics.routes';

const router = Router();

// HR Analytics (dashboards, drilldowns, exports, alerts)
router.use('/', analyticsRoutes);

// ESS config, approval workflows, notifications, IT declarations, ESS/MSS self-service
// MUST be mounted BEFORE attendance/employee routes to prevent /attendance/:id from catching /attendance/my-status
router.use('/', essRoutes);

// Org structure masters (departments, designations, grades, employee-types, cost-centres)
router.use('/', orgStructureRoutes);

// Employee management (full CRUD + sub-resources: nominees, education, prev-employment, documents, timeline)
router.use('/', employeeRoutes);

// Attendance management (records, rules, overrides, holidays, rosters, overtime)
router.use('/', attendanceRoutes);

// Leave management (leave-types, leave-policies, leave-balances, leave-requests, leave/summary)
router.use('/', leaveRoutes);

// Payroll management (salary components, structures, employee salaries, statutory configs, bank, loans, tax)
router.use('/', payrollRoutes);

// Payroll run engine (runs, entries, payslips, holds, revisions, arrears, statutory filings, reports)
router.use('/', payrollRunRoutes);

// Performance management (appraisal cycles, goals, entries, 360 feedback, skills, succession, dashboard)
router.use('/', performanceRoutes);

// Offboarding & F&F (exit requests, clearances, exit interviews, F&F settlements)
router.use('/', offboardingRoutes);

// Advanced HR (recruitment, training, assets, expenses, letters, grievance, discipline)
router.use('/', advancedRoutes);

// Transfer & Promotion (with approval workflow integration)
router.use('/', transferRoutes);

// Onboarding checklist (templates, tasks, progress)
router.use('/', onboardingRoutes);

// AI HR Chatbot (conversations, messages, escalation)
router.use('/', chatbotRoutes);

// Data Retention & GDPR Controls (ORA-11)
router.use('/', retentionRoutes);

export { router as hrRoutes };
