/**
 * Permission Catalogue for Avy ERP RBAC
 *
 * Structure: module:action
 * Actions: view, create, edit, delete, approve, export, configure
 */

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

export const PERMISSION_MODULES = {
  hr: {
    label: 'HR Management',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  production: {
    label: 'Production',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  inventory: {
    label: 'Inventory',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  sales: {
    label: 'Sales & Invoicing',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  finance: {
    label: 'Finance',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  maintenance: {
    label: 'Machine Maintenance',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  vendor: {
    label: 'Vendor Management',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'configure'],
  },
  security: {
    label: 'Security',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'configure'],
  },
  visitor: {
    label: 'Visitor Management',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'configure'],
  },
  masters: {
    label: 'Masters',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'configure'],
  },
  user: {
    label: 'User Management',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  role: {
    label: 'Role Management',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  company: {
    label: 'Company Settings',
    actions: ['view', 'edit', 'configure'],
  },
  report: {
    label: 'Reports',
    actions: ['view', 'create', 'export'],
  },
  audit: {
    label: 'Audit Logs',
    actions: ['view', 'export'],
  },
} as const;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

/**
 * Generate flat list of all available permissions.
 * e.g. ["hr:view", "hr:create", "hr:edit", ...]
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
 * Check if a user's permissions array includes a required permission.
 * Supports wildcard: ['*'] grants access to everything.
 * Supports module wildcard: ['hr:*'] grants all hr actions.
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;

  if (userPermissions.includes(required)) return true;

  // Check module wildcard: "hr:*" matches "hr:view"
  const [module] = required.split(':');
  if (module && userPermissions.includes(`${module}:*`)) return true;

  return false;
}

/**
 * Default permission sets for reference roles.
 */
export const REFERENCE_ROLE_PERMISSIONS: Record<string, { description: string; permissions: string[] }> = {
  'General Manager': {
    description: 'Multi-module read access with dashboards',
    permissions: [
      'hr:view', 'production:view', 'inventory:view', 'sales:view',
      'finance:view', 'maintenance:view', 'report:view', 'report:export',
    ],
  },
  'Plant Manager': {
    description: 'Plant-scoped operational modules',
    permissions: [
      'production:*', 'maintenance:*', 'inventory:view', 'inventory:edit',
      'hr:view', 'report:view', 'report:export',
    ],
  },
  'HR Personnel': {
    description: 'Full HR module access',
    permissions: ['hr:*', 'report:view', 'report:export'],
  },
  'Finance Team': {
    description: 'Finance module with read-only payroll',
    permissions: ['finance:*', 'hr:view', 'sales:view', 'report:view', 'report:export'],
  },
  'Production Manager': {
    description: 'Production and Machine Maintenance',
    permissions: ['production:*', 'maintenance:*', 'masters:view', 'report:view', 'report:export'],
  },
  'Maintenance Technician': {
    description: 'Machine Maintenance module',
    permissions: ['maintenance:view', 'maintenance:create', 'maintenance:edit', 'masters:view'],
  },
  'Sales Executive': {
    description: 'Sales & Invoicing module',
    permissions: ['sales:*', 'inventory:view', 'report:view', 'report:export'],
  },
  'Security Personnel': {
    description: 'Security and Visitor Management',
    permissions: ['security:*', 'visitor:*'],
  },
  'Stores Clerk': {
    description: 'Inventory module',
    permissions: ['inventory:*', 'vendor:view', 'masters:view'],
  },
  'Quality Inspector': {
    description: 'Production scrap/NC with reports',
    permissions: ['production:view', 'production:create', 'report:view', 'report:export'],
  },
  'Auditor': {
    description: 'Read-only across all modules',
    permissions: Object.keys(PERMISSION_MODULES).map(m => `${m}:view`),
  },
  'Viewer': {
    description: 'Read-only limited scope',
    permissions: ['hr:view', 'production:view', 'inventory:view'],
  },
};
