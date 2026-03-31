/**
 * Config Seeder Service
 *
 * Seeds all HRMS configuration models when a new company is created.
 * Uses upsert pattern for idempotency — safe to re-run without duplicating data.
 *
 * Seeded models: CompanySettings, SystemControls, AttendanceRule, OvertimeRule, ESSConfig.
 */

import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getIndustryDefaults } from '../constants/system-defaults';

/**
 * Seeds all 5 configuration models for a company with industry-appropriate defaults.
 *
 * @param companyId - The company ID to seed configs for
 * @param industryType - Optional industry type for template selection (e.g., 'MANUFACTURING', 'IT')
 *
 * Uses a Prisma transaction wrapping all 5 upserts for atomicity.
 * Each uses `upsert` with `where: { companyId }` so it is idempotent — if configs
 * already exist for this company, the seeder does nothing (update: {} is a no-op).
 */
export async function seedCompanyConfigs(companyId: string, industryType?: string): Promise<void> {
  const defaults = getIndustryDefaults(industryType);

  await platformPrisma.$transaction([
    platformPrisma.companySettings.upsert({
      where: { companyId },
      create: { companyId, ...defaults.settings },
      update: {},
    }),
    platformPrisma.systemControls.upsert({
      where: { companyId },
      create: { companyId, ...defaults.controls },
      update: {},
    }),
    platformPrisma.attendanceRule.upsert({
      where: { companyId },
      create: { companyId, ...defaults.attendanceRules },
      update: {},
    }),
    platformPrisma.overtimeRule.upsert({
      where: { companyId },
      create: { companyId, ...defaults.overtimeRules },
      update: {},
    }),
    platformPrisma.eSSConfig.upsert({
      where: { companyId },
      create: { companyId, ...defaults.essConfig },
      update: {},
    }),
  ]);

  // ── Seed default breaks for existing shifts (if shifts exist but have no breaks) ──
  try {
    const shifts = await platformPrisma.companyShift.findMany({
      where: { companyId },
      include: { breaks: { select: { id: true } } },
    });

    for (const shift of shifts) {
      if (shift.breaks.length === 0) {
        await platformPrisma.shiftBreak.createMany({
          data: [
            {
              shiftId: shift.id,
              name: 'Lunch Break',
              type: 'FIXED',
              startTime: '12:30',
              duration: 30,
              isPaid: false,
            },
            {
              shiftId: shift.id,
              name: 'Tea Break',
              type: 'FLEXIBLE',
              startTime: null,
              duration: 15,
              isPaid: true,
            },
          ],
        });
      }
    }
  } catch (breakErr) {
    // Non-fatal — breaks are optional enrichment
    logger.warn(`Failed to seed shift breaks (companyId=${companyId}): ${breakErr}`);
  }

  logger.info(`Company configs seeded successfully (companyId=${companyId}, industryType=${industryType ?? 'default'})`);
}
