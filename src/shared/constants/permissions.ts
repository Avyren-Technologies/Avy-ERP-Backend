/**
 * Permission Catalogue for Avy ERP RBAC
 *
 * Structure: module:action
 * Actions: read, create, update, delete, approve, export, configure
 */

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

/**
 * Permission inheritance: higher permissions imply lower ones.
 * configure > approve > export > create = update = delete > read
 * e.g., if user has 'hr:configure', they also have hr:approve, hr:export, hr:create, hr:update, hr:delete, hr:read
 */
export const PERMISSION_INHERITANCE: Record<string, string[]> = {
  configure: ['approve', 'export', 'create', 'update', 'delete', 'read'],
  approve: ['export', 'create', 'update', 'delete', 'read'],
  export: ['read'],
  create: ['read'],
  update: ['read'],
  delete: ['read'],
  read: [],
};

/**
 * Maps subscription module IDs (from MODULE_CATALOGUE) to permission module names.
 * When a company doesn't subscribe to a module, all permissions for that module are suppressed.
 */
export const MODULE_TO_PERMISSION_MAP: Record<string, string[]> = {
  'hr': ['hr', 'ess'],
  'security': ['security'],
  'production': ['production'],
  'machine-maintenance': ['maintenance'],
  'inventory': ['inventory'],
  'vendor': ['vendor'],
  'sales': ['sales'],
  'finance': ['finance'],
  'visitor': ['visitors'],
  'masters': ['masters'],
};

/**
 * Expand a flat permissions array by applying inheritance.
 * e.g., ['hr:configure'] → ['hr:configure', 'hr:approve', 'hr:export', 'hr:create', 'hr:update', 'hr:delete', 'hr:read']
 * ESS permissions (custom actions like view-payslips) are not expanded — they have no inheritance.
 */
export function expandPermissionsWithInheritance(permissions: string[]): string[] {
  const expanded = new Set(permissions);

  for (const perm of permissions) {
    if (perm === '*') return ['*'];

    const [module, action] = perm.split(':');
    if (!module || !action) continue;
    if (action === '*') continue; // module wildcard already covers all actions

    const inherited = PERMISSION_INHERITANCE[action];
    if (inherited) {
      for (const inheritedAction of inherited) {
        expanded.add(`${module}:${inheritedAction}`);
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Filter permissions by active company modules.
 * Removes any permission whose module is not in the company's active subscription.
 * System modules (user, role, company, reports, audit, platform) are never suppressed.
 */
export function suppressByModules(permissions: string[], activeModuleIds: string[]): string[] {
  const SYSTEM_PERMISSION_MODULES = new Set(['user', 'role', 'company', 'reports', 'audit', 'platform']);

  // Build set of allowed permission modules from active subscriptions
  const allowedPermModules = new Set(SYSTEM_PERMISSION_MODULES);
  for (const modId of activeModuleIds) {
    const permModules = MODULE_TO_PERMISSION_MAP[modId];
    if (permModules) {
      permModules.forEach(m => allowedPermModules.add(m));
    }
  }

  return permissions.filter(perm => {
    if (perm === '*') return true;
    const [module] = perm.split(':');
    if (!module) return false;
    return allowedPermModules.has(module);
  });
}

export const PERMISSION_MODULES = {
  hr: {
    label: 'HR Management',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  production: {
    label: 'Production',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  inventory: {
    label: 'Inventory',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  sales: {
    label: 'Sales & Invoicing',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  finance: {
    label: 'Finance',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  maintenance: {
    label: 'Machine Maintenance',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  vendor: {
    label: 'Vendor Management',
    actions: ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'],
  },
  security: {
    label: 'Security',
    actions: ['read', 'create', 'update', 'delete', 'export', 'configure'],
  },
  visitors: {
    label: 'Visitor Management',
    actions: ['read', 'create', 'update', 'delete', 'export', 'configure'],
  },
  masters: {
    label: 'Masters',
    actions: ['read', 'create', 'update', 'delete', 'export', 'configure'],
  },
  user: {
    label: 'User Management',
    actions: ['read', 'create', 'update', 'delete'],
  },
  role: {
    label: 'Role Management',
    actions: ['read', 'create', 'update', 'delete'],
  },
  company: {
    label: 'Company Settings',
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  reports: {
    label: 'Reports',
    actions: ['read', 'create', 'export'],
  },
  audit: {
    label: 'Audit Logs',
    actions: ['read', 'export'],
  },
  ess: {
    label: 'Employee Self-Service',
    actions: ['view-payslips', 'view-leave', 'apply-leave', 'view-attendance', 'regularize-attendance', 'view-holidays', 'it-declaration', 'view-directory', 'view-profile', 'download-form16', 'apply-loan', 'view-assets', 'view-goals', 'submit-appraisal', 'submit-feedback', 'enroll-training', 'raise-grievance', 'raise-helpdesk'],
  },
  platform: {
    label: 'Platform Administration',
    actions: ['admin'],
  },
} as const;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

/**
 * Generate flat list of all available permissions.
 * e.g. ["hr:read", "hr:create", "hr:update", ...]
 */
export function getAllPermissions(): string[] {
  const permissions: string[] = [];
  for (const [module, config] of Object.entries(PERMISSION_MODULES)) {
    for (const action of config.actions) {
      permissions.push(`${module}:${action}`);
    }
  }
  return permissions;
}

/**
 * Generate the permission catalogue with module metadata.
 * Returns { module, label, actions[] } for each module.
 */
export function getPermissionCatalogue(): { module: string; label: string; actions: readonly string[] }[] {
  return Object.entries(PERMISSION_MODULES).map(([module, config]) => ({
    module,
    label: config.label,
    actions: config.actions,
  }));
}

/**
 * Check if a user's permissions array includes a required permission.
 * Supports wildcard: ['*'] grants access to everything.
 * Supports module wildcard: ['hr:*'] grants all hr actions.
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;

  if (userPermissions.includes(required)) return true;

  // Check module wildcard: "hr:*" matches "hr:read"
  const [module] = required.split(':');
  if (module && userPermissions.includes(`${module}:*`)) return true;

  return false;
}

/**
 * Default permission sets for reference roles.
 * All action names match the route guard convention: read, create, update, delete.
 */
export const REFERENCE_ROLE_PERMISSIONS: Record<string, { description: string; permissions: string[] }> = {
  'General Manager': {
    description: 'Multi-module read access with dashboards',
    permissions: [
      'hr:read', 'production:read', 'inventory:read', 'sales:read',
      'finance:read', 'maintenance:read', 'reports:read', 'reports:export',
    ],
  },
  'Plant Manager': {
    description: 'Plant-scoped operational modules',
    permissions: [
      'production:*', 'maintenance:*', 'inventory:read', 'inventory:update',
      'hr:read', 'reports:read', 'reports:export',
    ],
  },
  'HR Personnel': {
    description: 'Full HR module access',
    permissions: ['hr:*', 'reports:read', 'reports:export'],
  },
  'Finance Team': {
    description: 'Finance module with read-only payroll',
    permissions: ['finance:*', 'hr:read', 'sales:read', 'reports:read', 'reports:export'],
  },
  'Production Manager': {
    description: 'Production and Machine Maintenance',
    permissions: ['production:*', 'maintenance:*', 'masters:read', 'reports:read', 'reports:export'],
  },
  'Maintenance Technician': {
    description: 'Machine Maintenance module',
    permissions: ['maintenance:read', 'maintenance:create', 'maintenance:update', 'masters:read'],
  },
  'Sales Executive': {
    description: 'Sales & Invoicing module',
    permissions: ['sales:*', 'inventory:read', 'reports:read', 'reports:export'],
  },
  'Security Personnel': {
    description: 'Security and Visitor Management',
    permissions: ['security:*', 'visitors:*'],
  },
  'Stores Clerk': {
    description: 'Inventory module',
    permissions: ['inventory:*', 'vendor:read', 'masters:read'],
  },
  'Quality Inspector': {
    description: 'Production scrap/NC with reports',
    permissions: ['production:read', 'production:create', 'reports:read', 'reports:export'],
  },
  'Auditor': {
    description: 'Read-only across all modules',
    permissions: Object.keys(PERMISSION_MODULES)
      .filter(m => m !== 'platform')
      .map(m => `${m}:read`),
  },
  'Viewer': {
    description: 'Read-only limited scope',
    permissions: ['hr:read', 'production:read', 'inventory:read'],
  },
  'Employee': {
    description: 'Standard employee with ESS access — self-service for leave, attendance, payslips, and profile',
    permissions: [
      'ess:view-payslips', 'ess:view-leave', 'ess:apply-leave',
      'ess:view-attendance', 'ess:regularize-attendance', 'ess:view-holidays',
      'ess:it-declaration', 'ess:view-directory', 'ess:view-profile',
      'ess:download-form16', 'ess:view-goals', 'ess:submit-appraisal',
      'ess:submit-feedback',
    ],
  },
  'Manager': {
    description: 'Team manager — ESS access plus team management, approvals, and reporting',
    permissions: [
      'ess:*', 'hr:read', 'hr:approve', 'reports:read',
    ],
  },
};
