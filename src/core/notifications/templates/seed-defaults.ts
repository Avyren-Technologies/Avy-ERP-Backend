import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { DEFAULT_CATALOGUE } from './defaults';
import type { Prisma } from '@prisma/client';

export interface SeedResult {
  created: number;
  rules: number;
  skipped: number;
}

/**
 * Idempotently seed the default notification template + rule set for one company.
 *
 * Runs inside a single transaction per company so partial seed failures don't
 * leave orphaned templates without their rules. Uses the unique index
 * (companyId, code, channel) for the skip-check instead of findFirst.
 */
export async function seedDefaultTemplatesForCompany(companyId: string): Promise<SeedResult> {
  let created = 0;
  let rules = 0;
  let skipped = 0;

  try {
    await platformPrisma.$transaction(async (tx) => {
      for (const entry of DEFAULT_CATALOGUE) {
        for (const channel of entry.channels) {
          const existing = await tx.notificationTemplate.findUnique({
            where: {
              companyId_code_channel: { companyId, code: entry.code, channel },
            },
          });
          if (existing) {
            skipped++;
            continue;
          }

          const template = await tx.notificationTemplate.create({
            data: {
              companyId,
              code: entry.code,
              name: entry.name,
              subject: entry.subject ?? null,
              body: entry.body,
              channel,
              priority: entry.priority,
              variables: entry.variables as Prisma.InputJsonValue,
              sensitiveFields: entry.sensitiveFields as Prisma.InputJsonValue,
              compiledBody: entry.body,
              compiledSubject: entry.subject ?? null,
              isSystem: true,
              isActive: true,
              version: 1,
            },
          });
          created++;

          await tx.notificationRule.create({
            data: {
              companyId,
              triggerEvent: entry.triggerEvent,
              category: entry.category,
              templateId: template.id,
              recipientRole: entry.recipientRole,
              channel,
              priority: entry.priority,
              isSystem: true,
              isActive: true,
              version: 1,
            },
          });
          rules++;
        }
      }
    });
  } catch (err) {
    logger.error('Seed transaction failed for company', { error: err, companyId });
    throw err;
  }

  return { created, rules, skipped };
}
