/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { seedDefaultTemplatesForCompany } from '../../src/core/notifications/templates/seed-defaults';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Seeding notification defaults for ${companies.length} companies...`);
  let totalCreated = 0;
  let totalRules = 0;
  let totalSkipped = 0;
  for (const c of companies) {
    try {
      const result = await seedDefaultTemplatesForCompany(c.id);
      totalCreated += result.created;
      totalRules += result.rules;
      totalSkipped += result.skipped;
      console.log(`  ✓ ${c.name}: ${result.created} templates created, ${result.rules} rules, ${result.skipped} skipped`);
    } catch (err) {
      console.error(`  ✗ ${c.name}:`, err);
    }
  }
  console.log(`\nTotal: ${totalCreated} templates, ${totalRules} rules, ${totalSkipped} skipped.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
