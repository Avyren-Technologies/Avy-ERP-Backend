import { PrismaClient } from '@prisma/client';
import { ApiError } from '../errors';

type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Atomically generate the next number from a NoSeriesConfig entry.
 *
 * Uses raw SQL to increment `startNumber` in a single UPDATE (race-condition safe)
 * then reads back the updated row to format the final reference string.
 *
 * @param tx            - Prisma client or transaction handle
 * @param companyId     - Company that owns the number series
 * @param linkedScreen  - Screen name(s) to match (e.g. 'Leave Management', 'Payroll')
 * @param entityLabel   - Human-readable label used in error messages (e.g. 'Leave Request')
 * @returns Formatted reference number, e.g. "LV-000001"
 */
export async function generateNextNumber(
  tx: PrismaTransaction | PrismaClient,
  companyId: string,
  linkedScreen: string | string[],
  entityLabel: string,
): Promise<string> {
  const screens = Array.isArray(linkedScreen) ? linkedScreen : [linkedScreen];

  const noSeries = await (tx as PrismaClient).noSeriesConfig.findFirst({
    where: { companyId, linkedScreen: { in: screens } },
  });

  if (!noSeries) {
    throw ApiError.badRequest(
      `Number Series is not configured for "${entityLabel}". ` +
      `Please create a Number Series with linked screen "${screens[0]}" first.`,
    );
  }

  // Atomically reserve the next number using raw SQL to prevent race conditions.
  await (tx as PrismaClient).$executeRaw`
    UPDATE no_series_configs
    SET "startNumber" = "startNumber" + 1,
        "updatedAt" = NOW()
    WHERE id = ${noSeries.id}
  `;

  // Read back the updated value
  const updated = await (tx as PrismaClient).noSeriesConfig.findUnique({
    where: { id: noSeries.id },
    select: { startNumber: true, prefix: true, suffix: true, numberCount: true },
  });

  if (!updated) {
    throw ApiError.internal(`Failed to generate ${entityLabel} number: NoSeries update failed`);
  }

  // The assigned number is (updated.startNumber - 1) since we incremented first.
  const assignedNumber = updated.startNumber - 1;
  const padded = String(assignedNumber).padStart(updated.numberCount || 5, '0');
  return `${updated.prefix || ''}${padded}${updated.suffix || ''}`;
}
