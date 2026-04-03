import { ApiError } from '../errors';
import { platformPrisma } from '../../config/database';

/** Cached demo tenant ID — populated on first call. */
let cachedDemoTenantId: string | null | undefined;

/**
 * Resolve the demo tenant ID from the platform DB (cached after first call).
 */
async function getDemoTenantId(): Promise<string | null> {
  if (cachedDemoTenantId !== undefined) return cachedDemoTenantId;

  const tenant = await platformPrisma.tenant.findFirst({
    where: { slug: 'demo' },
    select: { id: true },
  });

  cachedDemoTenantId = tenant?.id ?? null;
  return cachedDemoTenantId;
}

/**
 * Check whether the given tenant ID belongs to the demo tenant.
 */
export async function isDemoTenant(tenantId: string): Promise<boolean> {
  const demoId = await getDemoTenantId();
  return demoId !== null && demoId === tenantId;
}

/** Actions that are blocked in the demo tenant. */
const RESTRICTED_ACTIONS = new Set([
  'send-email',
  'send-sms',
  'export-data',
  'upload-file',
  'delete-company',
]);

/**
 * Throws `ApiError.forbidden` if the tenant is the demo tenant
 * and the action is restricted.
 */
export async function guardDemoAction(tenantId: string, action: string): Promise<void> {
  if (!RESTRICTED_ACTIONS.has(action)) return;

  const isDemo = await isDemoTenant(tenantId);
  if (isDemo) {
    throw ApiError.forbidden(
      `Action "${action}" is not allowed on the demo tenant`,
      'DEMO_RESTRICTED',
    );
  }
}

/** Reset the cached demo tenant ID (useful after re-seeding). */
export function resetDemoTenantCache(): void {
  cachedDemoTenantId = undefined;
}
