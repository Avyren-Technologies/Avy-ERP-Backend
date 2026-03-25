/**
 * One-time migration script: Fix RBAC for existing tenants.
 *
 * Run with: npx ts-node prisma/seed-rbac-fix.ts
 *
 * This script:
 * 1. Creates "Company Admin" system role for existing tenants that lack one
 * 2. Creates TenantUser bridge records for existing COMPANY_ADMIN users
 * 3. Updates old permission action names in existing Role records (view→read, edit→update)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_ADMIN_PERMISSIONS = [
  'company:*', 'hr:*', 'production:*', 'inventory:*', 'sales:*',
  'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
  'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
];

/** Map old action names to new ones */
function migratePermissionNames(permissions: string[]): string[] {
  return permissions.map(p => {
    // Fix action names
    let fixed = p
      .replace(/:view$/, ':read')
      .replace(/:edit$/, ':update');
    // Fix module names
    fixed = fixed
      .replace(/^report:/, 'reports:')
      .replace(/^visitor:/, 'visitors:');
    return fixed;
  });
}

async function main() {
  console.log('Starting RBAC migration...\n');

  // 1. Find all tenants
  const tenants = await prisma.tenant.findMany({
    include: { company: true },
  });
  console.log(`Found ${tenants.length} tenant(s)\n`);

  for (const tenant of tenants) {
    console.log(`--- Tenant: ${tenant.id} (Company: ${tenant.company?.name ?? 'N/A'}) ---`);

    // Check if "Company Admin" system role exists
    const existingAdminRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, name: 'Company Admin', isSystem: true },
    });

    let companyAdminRoleId: string;

    if (existingAdminRole) {
      console.log('  "Company Admin" role already exists');
      companyAdminRoleId = existingAdminRole.id;

      // Update its permissions to the latest set
      await prisma.role.update({
        where: { id: existingAdminRole.id },
        data: { permissions: COMPANY_ADMIN_PERMISSIONS },
      });
      console.log('  Updated Company Admin permissions to latest');
    } else {
      const newRole = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Company Admin',
          description: 'Full company access — all modules and actions',
          permissions: COMPANY_ADMIN_PERMISSIONS,
          isSystem: true,
        },
      });
      companyAdminRoleId = newRole.id;
      console.log('  Created "Company Admin" system role');
    }

    // 2. Find COMPANY_ADMIN users for this tenant's company who lack TenantUser records
    if (tenant.companyId) {
      const companyAdminUsers = await prisma.user.findMany({
        where: { companyId: tenant.companyId, role: 'COMPANY_ADMIN' },
        select: { id: true, email: true },
      });

      for (const user of companyAdminUsers) {
        const existingTU = await prisma.tenantUser.findUnique({
          where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        });

        if (!existingTU) {
          await prisma.tenantUser.create({
            data: {
              userId: user.id,
              tenantId: tenant.id,
              roleId: companyAdminRoleId,
            },
          });
          console.log(`  Created TenantUser for ${user.email}`);
        } else {
          console.log(`  TenantUser already exists for ${user.email}`);
        }
      }
    }

    // 3. Migrate permission names in ALL existing roles for this tenant
    const allRoles = await prisma.role.findMany({
      where: { tenantId: tenant.id },
    });

    for (const role of allRoles) {
      const oldPerms = role.permissions as string[];
      const newPerms = migratePermissionNames(oldPerms);

      // Only update if something changed
      if (JSON.stringify(oldPerms) !== JSON.stringify(newPerms)) {
        await prisma.role.update({
          where: { id: role.id },
          data: { permissions: newPerms },
        });
        console.log(`  Migrated permissions for role "${role.name}"`);
      }
    }

    console.log('');
  }

  console.log('RBAC migration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
