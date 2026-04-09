import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { DEFAULT_CATALOGUE } from './defaults';

export interface SeedResult {
  created: number;
  rules: number;
  skipped: number;
}

/**
 * Idempotently seed the default notification template + rule set for one company.
 * Called on tenant creation and via the seed migration script.
 * Skip creation if a template with the same (companyId, code, channel) already exists.
 */
export async function seedDefaultTemplatesForCompany(companyId: string): Promise<SeedResult> {
  let created = 0;
  let rules = 0;
  let skipped = 0;

  for (const entry of DEFAULT_CATALOGUE) {
    for (const channel of entry.channels) {
      try {
        const existing = await platformPrisma.notificationTemplate.findFirst({
          where: { companyId, code: entry.code, channel },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const template = await platformPrisma.notificationTemplate.create({
          data: {
            companyId,
            code: entry.code,
            name: entry.name,
            subject: entry.subject ?? null,
            body: entry.body,
            channel,
            priority: entry.priority,
            variables: entry.variables as any,
            sensitiveFields: entry.sensitiveFields as any,
            compiledBody: entry.body,
            compiledSubject: entry.subject ?? null,
            isSystem: true,
            isActive: true,
            version: 1,
          },
        });
        created++;

        await platformPrisma.notificationRule.create({
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
      } catch (err) {
        logger.error('Failed to seed template', { error: err, code: entry.code, channel });
      }
    }
  }
  return { created, rules, skipped };
}
