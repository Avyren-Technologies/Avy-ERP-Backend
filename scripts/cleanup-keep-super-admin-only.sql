-- =============================================================================
-- Avy ERP — NUCLEAR RESET: keep only SUPER_ADMIN rows in `users`; wipe the rest
--
-- • Drops ALL PostgreSQL schemas except system + public (tenant_* HRMS data).
-- • Deletes all companies, tenants, billing rows, support data, etc.
-- • Preserves: `_prisma_migrations`, global catalogue tables (modules, plans, …).
--
-- REQUIREMENTS
--   • At least one user with role = 'SUPER_ADMIN' or you will lock yourself out.
--   • Take a full backup first:
--       pg_dump -U … avy_erp > backup.sql
--
-- RUN (Docker example)
--   docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -v ON_ERROR_STOP=1 -f cleanup-keep-super-admin-only.sql
-- =============================================================================

-- ── PREVIEW (run separately if you want to inspect first) ───────────────────
-- SELECT id, email, role, "companyId" FROM users ORDER BY role, email;
-- SELECT COUNT(*) AS super_admins FROM users WHERE role = 'SUPER_ADMIN';
-- SELECT schema_name FROM information_schema.schemata
--   WHERE schema_name NOT IN ('pg_catalog','information_schema','public','pg_toast')
--     AND schema_name NOT LIKE 'pg\_%' ESCAPE '\'
--   ORDER BY 1;

BEGIN;

-- 1) Tenant-isolated data: drop every non-system schema except `public`
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT nspname
    FROM pg_catalog.pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')
      AND nspname NOT LIKE 'pg\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
  END LOOP;
END $$;

-- 2) `payments` references `invoices` with ON DELETE RESTRICT — clear before subscriptions/companies go
DELETE FROM payments;

-- 3) `report_history` references `companies` with ON DELETE RESTRICT
DELETE FROM report_history;

-- 4) All company/tenant logins (keeps SUPER_ADMIN only). Cascades: tenant_users, active_sessions, password_reset_tokens, …
DELETE FROM users WHERE role <> 'SUPER_ADMIN';

-- 5) All companies — cascades tenants, subscriptions, invoices, employees, support_tickets, …
DELETE FROM companies;

-- 6) Rows that are not always FK-cleaned to companies / tenants
DELETE FROM tenant_users;
DELETE FROM roles;
DELETE FROM company_registration_requests;
DELETE FROM audit_logs;
DELETE FROM analytics_audit_logs;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
SELECT id, email, role FROM users ORDER BY email;
SELECT COUNT(*) AS companies FROM companies;
SELECT COUNT(*) AS tenants FROM tenants;
SELECT COUNT(*) AS tenant_users FROM tenant_users;
SELECT COUNT(*) AS roles FROM roles;
