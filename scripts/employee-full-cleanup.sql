-- ═══════════════════════════════════════════════════════════════════════
-- EMPLOYEE FULL CLEANUP SCRIPT
-- ═══════════════════════════════════════════════════════════════════════
--
-- PURPOSE: Delete ALL employees and their related data for a company,
--          reset the Employee Number Series back to 1.
--
-- USAGE:
--   1. Change the company ID in the line below (one place only)
--   2. Run a DRY RUN first (uncomment the SELECT block at the bottom)
--   3. Once satisfied, run the full script
--
-- TESTED: 2026-04-12 on dev DB (company cmnueotnk00a5fcldzslz439i)
-- ═══════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────┐
-- │  CHANGE THIS TO YOUR TARGET COMPANY ID                            │
-- └─────────────────────────────────────────────────────────────────────┘
\set target_company '''YOUR_COMPANY_ID_HERE'''

-- ═══════════════════════════════════════════════════════════════════════
-- DRY RUN — Uncomment this block first to see what will be deleted
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'employees' as table_name, COUNT(*) as record_count FROM employees WHERE "companyId" = :target_company
UNION ALL SELECT 'users (employee-linked)', COUNT(*) FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'tenant_users', COUNT(*) FROM tenant_users WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company))
UNION ALL SELECT 'leave_balances', COUNT(*) FROM leave_balances WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'leave_requests', COUNT(*) FROM leave_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'onboarding_tasks', COUNT(*) FROM onboarding_tasks WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'probation_reviews', COUNT(*) FROM probation_reviews WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'it_declarations', COUNT(*) FROM it_declarations WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'employee_timeline', COUNT(*) FROM employee_timeline WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'employee_salaries', COUNT(*) FROM employee_salaries WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'overtime_requests', COUNT(*) FROM overtime_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'expense_claims', COUNT(*) FROM expense_claims WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company)
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company))
UNION ALL SELECT 'no_series_configs (EMP)', COUNT(*) FROM no_series_configs WHERE "companyId" = :target_company AND "linkedScreen" = 'Employee Onboarding'
ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════
-- ACTUAL DELETION — Runs in a single transaction (all-or-nothing)
-- ═══════════════════════════════════════════════════════════════════════
/*
BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 1: Delete non-cascading employee-linked records
-- These tables have employeeId FK but NO onDelete:Cascade
-- ─────────────────────────────────────────────────────────────────────

-- Attendance & Shifts
DELETE FROM overtime_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM shift_swap_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM wfh_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- Financial
DELETE FROM expense_claims WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM payroll_entries WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM payslips WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM salary_holds WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM salary_revisions WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM arrear_entries WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM bonus_batch_items WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- Performance
DELETE FROM goals WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM appraisal_entries WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM feedback_360 WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company) OR "raterId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM succession_plans WHERE "successorId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- Training & Assets
DELETE FROM training_nominations WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM asset_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- HR Letters, Grievances, Disciplinary
DELETE FROM hr_letters WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM grievance_cases WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM disciplinary_actions WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- Offboarding
DELETE FROM exit_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM fnf_settlements WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- Advanced / Misc
DELETE FROM production_incentive_records WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM data_access_requests WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM manager_delegates WHERE "managerId" IN (SELECT id FROM employees WHERE "companyId" = :target_company) OR "delegateId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM employee_transfers WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);
DELETE FROM employee_promotions WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- ─────────────────────────────────────────────────────────────────────
-- STEP 2: Delete User-linked records
-- (only for users that are employee-linked, NOT the company admin user)
-- ─────────────────────────────────────────────────────────────────────

DELETE FROM notifications WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));
DELETE FROM active_sessions WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));
DELETE FROM user_devices WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));
DELETE FROM user_notification_preferences WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));
DELETE FROM user_notification_category_preferences WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));

-- ─────────────────────────────────────────────────────────────────────
-- STEP 3: Delete TenantUser + User records
-- ─────────────────────────────────────────────────────────────────────

DELETE FROM tenant_users WHERE "userId" IN (SELECT id FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company));
DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = :target_company);

-- ─────────────────────────────────────────────────────────────────────
-- STEP 4: Clear employee self-references (reporting/functional manager)
-- Required before deleting employees to avoid FK constraint errors
-- ─────────────────────────────────────────────────────────────────────

UPDATE employees SET "reportingManagerId" = NULL WHERE "companyId" = :target_company;
UPDATE employees SET "functionalManagerId" = NULL WHERE "companyId" = :target_company;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 5: Delete all employees
-- 18 child tables auto-delete via onDelete:Cascade:
--   employee_timeline, onboarding_tasks, leave_balances, leave_requests,
--   attendance_records, probation_reviews, it_declarations,
--   employee_nominees, employee_education, employee_prev_employment,
--   employee_documents, employee_salaries, loan_records, skill_mappings,
--   training_attendance, training_program_enrollments,
--   shift_rotation_assignments, consent_records, chat_conversations
-- ─────────────────────────────────────────────────────────────────────

DELETE FROM employees WHERE "companyId" = :target_company;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 6: Reset Employee Number Series back to 1
-- Next bulk upload will start from EMP-000001
-- ─────────────────────────────────────────────────────────────────────

UPDATE no_series_configs SET "startNumber" = 1 WHERE "companyId" = :target_company AND "linkedScreen" = 'Employee Onboarding';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- POST-CLEANUP VERIFICATION — Run after COMMIT to confirm
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'employees' as table_name, COUNT(*) as remaining FROM employees WHERE "companyId" = :target_company
UNION ALL SELECT 'users (employee-linked)', COUNT(*) FROM users WHERE "employeeId" IS NOT NULL AND "companyId" = :target_company
UNION ALL SELECT 'no_series (startNumber)', "startNumber" FROM no_series_configs WHERE "companyId" = :target_company AND "linkedScreen" = 'Employee Onboarding'
ORDER BY 1;
*/
