/**
 * Feature Toggle Catalogue for Avy ERP
 *
 * Defines all toggleable features. Feature toggles are per-user overrides
 * independent of role-based permissions. A user can have a role that permits
 * access to HR, but a feature toggle can disable "biometric-attendance" specifically.
 */

export interface FeatureToggleDefinition {
  label: string;
  module: string;
  description: string;
}

export const FEATURE_TOGGLE_CATALOGUE: Record<string, FeatureToggleDefinition> = {
  'ess-portal': {
    label: 'Employee Self-Service Portal',
    module: 'hr',
    description: 'Allow employees to view payslips, apply for leave, and update personal details',
  },
  'mobile-app-access': {
    label: 'Mobile App Access',
    module: 'platform',
    description: 'Allow user to access the mobile application',
  },
  'biometric-attendance': {
    label: 'Biometric Attendance',
    module: 'hr',
    description: 'Enable biometric device integration for attendance tracking',
  },
  'advanced-reports': {
    label: 'Advanced Reports',
    module: 'reports',
    description: 'Access to advanced analytics dashboards and custom report builder',
  },
  'bulk-operations': {
    label: 'Bulk Operations',
    module: 'platform',
    description: 'Allow bulk import, export, and batch update operations',
  },
  'e-sign': {
    label: 'Electronic Signatures',
    module: 'hr',
    description: 'Enable electronic signatures for HR letters and documents',
  },
  'multi-currency': {
    label: 'Multi-Currency',
    module: 'finance',
    description: 'Enable multi-currency transactions and exchange rate management',
  },
  'geo-attendance': {
    label: 'Geo-Fenced Attendance',
    module: 'hr',
    description: 'Enable GPS-based attendance with geo-fence boundary checks',
  },
  'approval-workflows': {
    label: 'Approval Workflows',
    module: 'platform',
    description: 'Enable multi-level approval workflows for leave, expenses, and purchases',
  },
  'ai-chatbot': {
    label: 'AI Chatbot',
    module: 'platform',
    description: 'Enable AI-powered chatbot for employee queries and HR assistance',
  },
};

/**
 * Get the full catalogue as an array with keys.
 */
export function getFeatureToggleCatalogue() {
  return Object.entries(FEATURE_TOGGLE_CATALOGUE).map(([key, def]) => ({
    key,
    ...def,
  }));
}
