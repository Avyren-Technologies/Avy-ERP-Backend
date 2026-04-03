/**
 * Subdomain labels that must not be used as tenant slugs (platform hosts / routing).
 * Shared by tenant middleware and onboarding validators — single source of truth.
 */
export const RESERVED_SLUGS = new Set<string>([
  'admin', 'www', 'api', 'app', 'staging', 'dev', 'test', 'demo',
  'mail', 'ftp', 'cdn', 'static', 'assets', 'docs', 'help',
  'support', 'status', 'blog', 'avy-erp-api', 'pg', 'ssh',
]);

/** Aligned with `slug` in `tenant.validators` — single DNS label, no dots. */
const TENANT_SLUG_BODY = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Returns true if `slug` is a valid tenant subdomain label (length, charset, not reserved).
 * Use after normalizing to lowercase.
 */
export function isValidTenantSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 50) return false;
  if (!TENANT_SLUG_BODY.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}
