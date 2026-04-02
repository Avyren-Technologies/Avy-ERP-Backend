import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { resolve } from 'path';

const platformPrisma = new PrismaClient();

async function migrateTenants() {
  const targetSlug = process.argv.find((arg) => arg.startsWith('--tenant='))?.split('=')[1];

  console.log('🔄 Fetching active tenants...');

  const where: any = { status: { in: ['ACTIVE', 'TRIAL'] } };
  if (targetSlug) {
    where.slug = targetSlug;
    console.log(`🎯 Targeting single tenant: ${targetSlug}`);
  }

  const tenants = await platformPrisma.tenant.findMany({
    where,
    select: { id: true, slug: true, schemaName: true },
    orderBy: { createdAt: 'asc' },
  });

  if (tenants.length === 0) {
    console.log('ℹ️  No tenants found to migrate.');
    await platformPrisma.$disconnect();
    process.exit(0);
  }

  console.log(`📋 Found ${tenants.length} tenant(s) to migrate\n`);

  let succeeded = 0;
  let failed = 0;
  const failures: { slug: string; error: string }[] = [];

  for (const tenant of tenants) {
    const label = `[${tenant.slug}] (schema: ${tenant.schemaName})`;
    try {
      console.log(`⏳ Migrating ${label}...`);

      // Build connection URL for this tenant's schema
      const baseUrl = process.env.DATABASE_URL!;
      const tenantUrl = baseUrl.includes('schema=')
        ? baseUrl.replace(/schema=[^&]+/, `schema=${tenant.schemaName}`)
        : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}schema=${tenant.schemaName}`;

      // Run prisma migrate deploy with the tenant's schema
      execSync('npx prisma migrate deploy', {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: tenantUrl },
        stdio: 'pipe',
      });

      console.log(`✅ ${label} — migrated successfully`);
      succeeded++;
    } catch (err: any) {
      const errorMsg = err.stderr?.toString()?.trim() || err.message || 'Unknown error';
      console.error(`❌ ${label} — FAILED: ${errorMsg.slice(0, 200)}`);
      failures.push({ slug: tenant.slug, error: errorMsg.slice(0, 200) });
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${succeeded} succeeded, ${failed} failed, ${tenants.length} total`);

  if (failures.length > 0) {
    console.log('\n❌ Failed tenants:');
    for (const f of failures) {
      console.log(`  - ${f.slug}: ${f.error}`);
    }
    console.log('\nRetry individual tenants with: pnpm db:migrate-tenants -- --tenant=<slug>');
  }

  await platformPrisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

migrateTenants().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
