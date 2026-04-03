#!/usr/bin/env npx tsx
// ============================================================
// Seed Demo Tenant — Creates a demo tenant with sample HRMS data.
//
// Creates:
//   - Demo tenant (slug: "demo", schema: "tenant_demo")
//   - Demo company ("Demo Company", Manufacturing)
//   - 2 demo users (demo-admin@avyerp.com, demo-user@avyerp.com)
//   - Sample departments, designations, and leave types
//
// Usage:
//   npx tsx scripts/seed-demo-tenant.ts
//   pnpm demo:seed
// ============================================================

import { PrismaClient, TenantStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const DEMO_SLUG = 'demo';
const DEMO_SCHEMA = 'tenant_demo';
const DEMO_COMPANY_NAME = 'Demo Company';
const DEMO_INDUSTRY = 'Manufacturing';

const DEMO_ADMIN_EMAIL = 'demo-admin@avyerp.com';
const DEMO_USER_EMAIL = 'demo-user@avyerp.com';
const DEMO_PASSWORD = 'demo123';

// Import defaults (relative paths since this is a standalone script)
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_LEAVE_TYPES,
} from '../src/shared/constants/company-defaults';

// ── Prisma Client (uses platform DB) ──
const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main(): Promise<void> {
  console.log('=== Seeding Demo Tenant ===\n');

  // 1. Create or find the demo company
  let company = await prisma.company.findFirst({
    where: { name: DEMO_COMPANY_NAME },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEMO_COMPANY_NAME,
        registeredName: DEMO_COMPANY_NAME,
        industry: DEMO_INDUSTRY,
        companySize: 'SMALL',
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        status: 'Active',
      },
    });
    console.log(`  Created company: ${company.name} (${company.id})`);
  } else {
    console.log(`  Found existing company: ${company.name} (${company.id})`);
  }

  // 2. Create or find the demo tenant
  let tenant = await prisma.tenant.findFirst({
    where: { slug: DEMO_SLUG },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        companyId: company.id,
        slug: DEMO_SLUG,
        schemaName: DEMO_SCHEMA,
        status: TenantStatus.ACTIVE,
      },
    });
    console.log(`  Created tenant: ${tenant.slug} (schema: ${tenant.schemaName})`);
  } else {
    console.log(`  Found existing tenant: ${tenant.slug} (schema: ${tenant.schemaName})`);
  }

  // 3. Ensure the tenant schema exists
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${DEMO_SCHEMA}"`);
  console.log(`  Ensured schema "${DEMO_SCHEMA}" exists`);

  // 4. Run migrations on the tenant schema by creating a tenant-scoped Prisma client
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const tenantDbUrl = databaseUrl.includes('?')
    ? `${databaseUrl}&schema=${DEMO_SCHEMA}`
    : `${databaseUrl}?schema=${DEMO_SCHEMA}`;

  const tenantDb = new PrismaClient({
    datasources: { db: { url: tenantDbUrl } },
  });

  // 5. Create demo users
  const hashedPassword = await hashPassword(DEMO_PASSWORD);

  // Admin user
  let adminUser = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: DEMO_ADMIN_EMAIL,
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Admin',
        role: 'COMPANY_ADMIN',
        companyId: company.id,
        isActive: true,
        emailVerified: true,
      },
    });
    console.log(`  Created admin user: ${adminUser.email}`);
  } else {
    // Update password and companyId in case they changed
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { password: hashedPassword, companyId: company.id },
    });
    console.log(`  Found existing admin user: ${adminUser.email} (password reset)`);
  }

  // Regular user
  let regularUser = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });

  if (!regularUser) {
    regularUser = await prisma.user.create({
      data: {
        email: DEMO_USER_EMAIL,
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'User',
        role: 'USER',
        companyId: company.id,
        isActive: true,
        emailVerified: true,
      },
    });
    console.log(`  Created regular user: ${regularUser.email}`);
  } else {
    await prisma.user.update({
      where: { id: regularUser.id },
      data: { password: hashedPassword, companyId: company.id },
    });
    console.log(`  Found existing regular user: ${regularUser.email} (password reset)`);
  }

  // 6. Seed HRMS data into tenant schema
  console.log('\n  Seeding HRMS data...');

  // Departments (subset)
  const deptSubset = DEFAULT_DEPARTMENTS.slice(0, 4); // EXEC, HR, FIN, OPS
  try {
    await tenantDb.department.createMany({
      data: deptSubset.map((d) => ({
        companyId: company!.id,
        code: d.code,
        name: d.name,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`    Departments: ${deptSubset.length} seeded`);
  } catch (err) {
    console.log(`    Departments: skipped (table may not exist yet — run db:migrate first)`);
  }

  // Designations (subset)
  const desigSubset = DEFAULT_DESIGNATIONS.slice(0, 6); // CEO through SM
  try {
    await tenantDb.designation.createMany({
      data: desigSubset.map((d) => ({
        companyId: company!.id,
        code: d.code,
        name: d.name,
        jobLevel: d.jobLevel,
        managerialFlag: d.managerialFlag,
        probationDays: d.probationDays,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`    Designations: ${desigSubset.length} seeded`);
  } catch (err) {
    console.log(`    Designations: skipped (table may not exist yet — run db:migrate first)`);
  }

  // Leave types
  try {
    await tenantDb.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((lt) => ({
        companyId: company!.id,
        code: lt.code,
        name: lt.name,
        category: lt.category,
        annualEntitlement: lt.annualEntitlement,
        accrualFrequency: lt.accrualFrequency,
        carryForwardAllowed: lt.carryForwardAllowed,
        encashmentAllowed: lt.encashmentAllowed,
        allowHalfDay: lt.allowHalfDay,
        documentRequired: lt.documentRequired,
        lopOnExcess: lt.lopOnExcess,
        probationRestricted: lt.probationRestricted,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`    Leave Types: ${DEFAULT_LEAVE_TYPES.length} seeded`);
  } catch (err) {
    console.log(`    Leave Types: skipped (table may not exist yet — run db:migrate first)`);
  }

  // Cleanup
  await tenantDb.$disconnect();

  console.log('\n=== Demo Tenant Seeding Complete ===');
  console.log(`\n  Login credentials:`);
  console.log(`    Admin:  ${DEMO_ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`    User:   ${DEMO_USER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('Error seeding demo tenant:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
