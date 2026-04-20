# Merge Guide — `COMPANY_ADMIN_PERMISSIONS` Unification + `docdiff` Module

> **When to use this document:**
> Apply these changes manually after resolving merge conflicts between branches
> that independently touched `auth.service.ts`, `tenant.service.ts`, or `rbac.service.ts`.

---

## Background

The `COMPANY_ADMIN_PERMISSIONS` array was previously inlined (duplicated) in 3 files:
- `src/core/auth/auth.service.ts`
- `src/core/tenant/tenant.service.ts`
- `src/core/rbac/rbac.service.ts`

This guide unifies them into a single exported constant in `permissions.ts` and adds the `docdiff` module.

---

## File 1 — `src/shared/constants/permissions.ts`

> **Status:** ✅ Already updated on this branch. No conflict expected here.
> Verify after merge that all 4 additions below are still present.

### 1a. `MODULE_TO_PERMISSION_MAP` — Add `docdiff`

```diff
 export const MODULE_TO_PERMISSION_MAP: Record<string, string[]> = {
   'hr': ['hr', 'ess', 'recruitment', 'recruitment-offer', 'training', 'training-evaluation', 'analytics', 'attendance'],
   'security': ['security'],
   'production': ['production'],
   'machine-maintenance': ['maintenance'],
   'inventory': ['inventory'],
   'vendor': ['vendor'],
   'sales': ['sales'],
   'finance': ['finance'],
   'visitor': ['visitors'],
   'masters': ['masters'],
+  'docdiff': ['docdiff'],
 };
```

### 1b. `suppressByModules` — Fix stale doc comment

```diff
-/**
- * Filter permissions by active company modules.
- * Removes any permission whose module is not in the company's active subscription.
- * System modules (user, role, company, reports, audit, platform) are never suppressed.
- */
+/**
+ * Filter permissions by active company modules.
+ * Removes any permission whose module is not in the company's active subscription.
+ * System modules (user, role, company, reports, audit, platform, billing) are never
+ * suppressed — they are always available regardless of subscription tier.
+ * All other modules (hr, production, inventory, sales, finance, maintenance, vendor,
+ * security, visitors, masters, docdiff, etc.) are gated by active subscription modules.
+ */
 export function suppressByModules(permissions: string[], activeModuleIds: string[]): string[] {
```

### 1c. `PERMISSION_MODULES` — Add `docdiff` entry

Add this block **after** the `audit` entry:

```diff
   audit: {
     label: 'Audit Logs',
     actions: ['read', 'export'],
   },
+  docdiff: {
+    label: 'Document Diff',
+    actions: ['read', 'create', 'update', 'delete', 'export'],
+  },
   recruitment: {
```

### 1d. `COMPANY_ADMIN_PERMISSIONS` — Add the exported constant

Add this block **after** `export type PermissionModule = keyof typeof PERMISSION_MODULES;`:

```typescript
/**
 * Canonical permission set for the "Company Admin" system role.
 *
 * This is the single source of truth for what a Company Admin can do on creation.
 * Import and use this constant in auth.service.ts, tenant.service.ts, and
 * rbac.service.ts — do NOT inline this list in those files.
 *
 * NOTE: `docdiff:*` is included here so newly onboarded Company Admins have full
 * DocDiff access by default. The super admin can revoke it per-company via the
 * Company Admin Permissions screen. It is subscription-gated via MODULE_TO_PERMISSION_MAP
 * (not in SYSTEM_PERMISSION_MODULES), so the permission will be suppressed at auth
 * time if the company's subscription does not include the 'docdiff' module.
 */
export const COMPANY_ADMIN_PERMISSIONS: string[] = [
  'company:*', 'hr:*', 'ess:*', 'attendance:*', 'production:*', 'inventory:*', 'sales:*',
  'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
  'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
  'billing:*', 'analytics:*', 'docdiff:*',
];
```

---

## File 2 — `src/core/rbac/rbac.service.ts`

> **Status:** ✅ Already updated on this branch. Verify after merge.

### 2a. Import — Add `COMPANY_ADMIN_PERMISSIONS`

```diff
-import { getAllPermissions, REFERENCE_ROLE_PERMISSIONS, hasPermission } from '../../shared/constants/permissions';
+import { getAllPermissions, REFERENCE_ROLE_PERMISSIONS, hasPermission, COMPANY_ADMIN_PERMISSIONS } from '../../shared/constants/permissions';
```

### 2b. `syncCompanyAdminPermissions()` — Remove inline constant

Find `syncCompanyAdminPermissions()` and remove the local inline array.
Replace:

```typescript
// The canonical Company Admin permission set (must match tenant.service.ts)
const COMPANY_ADMIN_PERMISSIONS = [
  'company:*', 'hr:*', 'ess:*', 'attendance:*', 'production:*', 'inventory:*', 'sales:*',
  'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
  'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
  'billing:*', 'analytics:*',
];
```

With:

```typescript
// Imported from permissions.ts — single source of truth for Company Admin permissions.
```

> The `COMPANY_ADMIN_PERMISSIONS` references below in the same function (`.filter()`, spread `[...new Set(...)]`) will now resolve to the module-level import automatically — no other changes needed in this function.

---

## File 3 — `src/core/tenant/tenant.service.ts`

> **Status:** ✅ Already updated on this branch. Verify after merge.

### 3a. Import — Add `COMPANY_ADMIN_PERMISSIONS` (new import line)

Add after the `company-defaults` import block (around line 8–9):

```diff
 } from '../../shared/constants/company-defaults';
+import { COMPANY_ADMIN_PERMISSIONS } from '../../shared/constants/permissions';
 import { platformPrisma } from '../../config/database';
```

### 3b. `onboardTenant()` — Replace inline permissions array

Find the `'Company Admin'` role creation block inside `onboardTenant` (step 9 of the transaction). Replace the inline array:

```diff
           name: 'Company Admin',
           description: 'Full company access — all modules and actions',
-          permissions: [
-            'company:*', 'hr:*', 'ess:*', 'attendance:*', 'production:*', 'inventory:*', 'sales:*',
-            'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
-            'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
-            'billing:*', 'analytics:*',
-          ],
+          permissions: COMPANY_ADMIN_PERMISSIONS,
           isSystem: true,
```

---

## File 4 — `src/core/auth/auth.service.ts`

> **Status:** ⚠️ NOT yet updated — apply this after resolving merge conflicts on this file.

### 4a. Import — Add `COMPANY_ADMIN_PERMISSIONS`

```diff
-import { expandPermissionsWithInheritance, suppressByModules } from '../../shared/constants/permissions';
+import { expandPermissionsWithInheritance, suppressByModules, COMPANY_ADMIN_PERMISSIONS } from '../../shared/constants/permissions';
```

### 4b. `register()` — Replace inline permissions array

Find the `'Company Admin'` role creation block inside the `register()` transaction. Replace the inline array:

```diff
           name: 'Company Admin',
           description: 'Full company access — all modules and actions',
-          permissions: [
-            'company:*', 'hr:*', 'ess:*', 'attendance:*', 'production:*', 'inventory:*', 'sales:*',
-            'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
-            'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
-            'billing:*', 'analytics:*',
-          ],
+          permissions: COMPANY_ADMIN_PERMISSIONS,
           isSystem: true,
```

---

## Checklist — After completing all merges

Run through this before marking the merge done:

- [ ] `permissions.ts` — `docdiff` present in `MODULE_TO_PERMISSION_MAP`
- [ ] `permissions.ts` — `docdiff` present in `PERMISSION_MODULES`
- [ ] `permissions.ts` — `suppressByModules` comment is up to date (mentions `billing`, notes docdiff is gated)
- [ ] `permissions.ts` — `COMPANY_ADMIN_PERMISSIONS` is exported and includes `docdiff:*`
- [ ] `rbac.service.ts` — imports `COMPANY_ADMIN_PERMISSIONS` from permissions
- [ ] `rbac.service.ts` — `syncCompanyAdminPermissions()` has NO local inline array
- [ ] `tenant.service.ts` — imports `COMPANY_ADMIN_PERMISSIONS` from permissions
- [ ] `tenant.service.ts` — `onboardTenant()` uses `COMPANY_ADMIN_PERMISSIONS` (not inline)
- [ ] `auth.service.ts` — imports `COMPANY_ADMIN_PERMISSIONS` from permissions
- [ ] `auth.service.ts` — `register()` uses `COMPANY_ADMIN_PERMISSIONS` (not inline)
- [ ] No other file in `src/` contains an inline `'billing:*', 'analytics:*'` Company Admin list (grep to verify)

### Quick verify command

```bash
# Should return 0 results after all changes are applied
grep -rn "'billing:\*', 'analytics:\*'" src/
```

---

## Design decisions recorded here

| Decision | Choice | Reason |
|----------|--------|--------|
| Where to define Company Admin perms | `permissions.ts` exported constant | Single source of truth — avoids 3-file drift |
| `docdiff` in `SYSTEM_PERMISSION_MODULES`? | ❌ No — stays subscription-gated | Super admin controls per-company via the admin permissions screen |
| `docdiff:*` seeded for new Company Admins? | ✅ Yes — included in `COMPANY_ADMIN_PERMISSIONS` | Full access by default; super admin can revoke |
| `docdiff` in `MODULE_TO_PERMISSION_MAP`? | ✅ Yes, key `'docdiff'` | Makes it suppressible by subscription module gating |
