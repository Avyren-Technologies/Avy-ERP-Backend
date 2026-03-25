/**
 * Permission Catalogue for Avy ERP RBAC
 *
 * Structure: module:action
 * Actions: read, create, update, delete, approve, export, configure
 */

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'export', 'configure'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

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
};
