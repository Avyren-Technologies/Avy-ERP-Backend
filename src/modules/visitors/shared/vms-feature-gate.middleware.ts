import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

type VmsFeatureKey =
  | 'recurringPassEnabled'
  | 'vehicleGatePassEnabled'
  | 'materialGatePassEnabled'
  | 'groupVisitEnabled'
  | 'emergencyMusterEnabled';

const FEATURE_LABELS: Record<VmsFeatureKey, string> = {
  recurringPassEnabled: 'Recurring Passes',
  vehicleGatePassEnabled: 'Vehicle Gate Passes',
  materialGatePassEnabled: 'Material Gate Passes',
  groupVisitEnabled: 'Group Visits',
  emergencyMusterEnabled: 'Emergency Muster',
};

/**
 * Middleware that checks a VMS config boolean toggle before allowing access.
 * Read-only GET requests are always allowed (so the frontend can still show
 * the disabled state gracefully). Only write operations (POST/PUT/DELETE) are gated.
 */
export function requireVmsFeature(feature: VmsFeatureKey): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Allow GET requests through so frontend can display empty/disabled states
    if (req.method === 'GET') { next(); return; }

    try {
      const companyId = req.user?.companyId;
      if (!companyId) { next(); return; }

      const config = await platformPrisma.visitorManagementConfig.findUnique({
        where: { companyId },
        select: { [feature]: true },
      });

      // If no config exists or feature is enabled, allow through
      if (!config || (config as any)[feature] !== false) {
        next();
        return;
      }

      throw ApiError.badRequest(
        `${FEATURE_LABELS[feature]} feature is disabled. Enable it in VMS Settings.`,
      );
    } catch (err) {
      next(err);
    }
  };
}
