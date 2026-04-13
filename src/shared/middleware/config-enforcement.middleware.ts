/**
 * Config Enforcement Middleware
 *
 * Express middleware for enforcing HRMS configuration rules at the route level.
 * This is Layer 1 (MIDDLEWARE ENFORCEMENT) — runs BEFORE controllers.
 *
 * Provides three enforcement mechanisms:
 *
 *   1. requireModuleEnabled(module)  — Checks SystemControls.*Enabled flag
 *      Applied to entire route groups (attendance, leave, payroll, etc.)
 *
 *   2. requireESSFeature(feature)    — Checks ESSConfig.* flag
 *      Applied to individual ESS routes (leave application, regularization, etc.)
 *
 *   3. validatePayrollNotLocked()    — Checks payroll lock + run status
 *      Called from service methods before modifying attendance in locked periods
 *
 * Per design spec Sections 6.2, 6.3, and Appendix B.5.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { SystemControls, ESSConfig } from '@prisma/client';
import { ApiError } from '../errors';
import { logger } from '../../config/logger';
import { platformPrisma } from '../../config/database';
import {
  getCachedSystemControls,
  getCachedESSConfig,
} from '../utils/config-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

type ModuleKey = 'attendance' | 'leave' | 'payroll' | 'ess' | 'performance' | 'recruitment' | 'training' | 'visitor';

/**
 * Map from module key to the corresponding boolean field on SystemControls.
 * This avoids unsafe dynamic key construction.
 */
const MODULE_TO_FIELD: Record<ModuleKey, keyof SystemControls> = {
  attendance: 'attendanceEnabled',
  leave: 'leaveEnabled',
  payroll: 'payrollEnabled',
  ess: 'essEnabled',
  performance: 'performanceEnabled',
  recruitment: 'recruitmentEnabled',
  training: 'trainingEnabled',
  visitor: 'visitorEnabled',
};

// ─── Module Enforcement ─────────────────────────────────────────────────────

/**
 * Middleware that checks whether a specific HRMS module is enabled for the
 * requesting user's company. Reads from Redis-cached SystemControls with DB
 * fallback.
 *
 * Usage in routes:
 * ```typescript
 * router.use(requireModuleEnabled('attendance'));
 * ```
 *
 * @param module - Module key to check
 * @returns Express middleware that throws ApiError.forbidden() if module is disabled
 */
export function requireModuleEnabled(module: ModuleKey): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw ApiError.forbidden('Company context required to check module access');
      }

      const controls = await getCachedSystemControls(companyId);
      const fieldName = MODULE_TO_FIELD[module];
      const isEnabled = controls[fieldName];

      if (!isEnabled) {
        logger.info(
          `Module access denied: ${module} is disabled for company ${companyId}`,
        );
        throw ApiError.forbidden(
          `${module} module is not enabled for this company`,
          'MODULE_DISABLED',
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── ESS Feature Enforcement ────────────────────────────────────────────────

/**
 * Middleware that checks whether a specific ESS feature is enabled for the
 * requesting user's company. Reads from Redis-cached ESSConfig with DB fallback.
 *
 * Usage in routes:
 * ```typescript
 * router.post('/ess/apply-leave', requireESSFeature('leaveApplication'), controller.applyLeave);
 * router.get('/ess/my-payslips', requireESSFeature('viewPayslips'), controller.getMyPayslips);
 * ```
 *
 * @param feature - ESSConfig field name to check (must be a boolean field)
 * @returns Express middleware that throws ApiError.forbidden() if feature is disabled
 */
export function requireESSFeature(feature: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw ApiError.forbidden('Company context required to check ESS feature access');
      }

      const essConfig = await getCachedESSConfig(companyId);
      const isEnabled = (essConfig as Record<string, unknown>)[feature];

      if (isEnabled === false) {
        logger.info(
          `ESS feature access denied: ${feature} is disabled for company ${companyId}`,
        );
        throw ApiError.forbidden(
          `${feature} is not enabled for employee self-service`,
          'ESS_FEATURE_DISABLED',
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── Payroll Lock Enforcement ───────────────────────────────────────────────

/** Payroll run statuses that constitute a "locked" state. */
const LOCKED_STATUSES = ['APPROVED', 'DISBURSED', 'ARCHIVED'];

/**
 * Validate that the payroll period covering the given date is NOT locked.
 * Call this from service methods before modifying attendance records,
 * overtime requests, or payroll entries for a specific date.
 *
 * This is NOT middleware — it is a service-level check called imperatively:
 * ```typescript
 * await validatePayrollNotLocked(companyId, attendanceDate);
 * ```
 *
 * @param companyId - The company to check
 * @param date      - The attendance/payroll date to validate against
 * @throws ApiError.forbidden() if the payroll period is locked
 */
export async function validatePayrollNotLocked(companyId: string, date: Date): Promise<void> {
  const controls = await getCachedSystemControls(companyId);

  // If payroll lock feature is disabled, no enforcement needed
  if (!controls.payrollLock) {
    return;
  }

  // Determine month and year from the provided date
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  const year = date.getFullYear();

  // Look up the payroll run for this month/year
  const payrollRun = await platformPrisma.payrollRun.findUnique({
    where: {
      companyId_month_year: {
        companyId,
        month,
        year,
      },
    },
    select: {
      status: true,
      month: true,
      year: true,
    },
  });

  if (payrollRun && LOCKED_STATUSES.includes(payrollRun.status)) {
    const dateStr = date.toISOString().split('T')[0];
    logger.info(
      `Payroll lock enforcement: blocked modification for ${dateStr} [company=${companyId}, payroll=${payrollRun.month}/${payrollRun.year}, status=${payrollRun.status}]`,
    );
    throw ApiError.forbidden(
      `Payroll period is locked (${payrollRun.status}). Cannot modify attendance for ${dateStr}.`,
      'PAYROLL_LOCKED',
    );
  }
}
