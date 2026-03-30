import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient, BillingType, CompanySize, SubscriptionStatus, TenantStatus, UserRole, UserTier } from '@prisma/client';
import { REFERENCE_ROLE_PERMISSIONS } from '../src/shared/constants/permissions';

dotenv.config();

const prisma = new PrismaClient();

type SeedConfig = {
  companyName: string;
  industry: string;
  companySize: CompanySize;
  website?: string;
  gstNumber?: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  adminPhone?: string;
  superAdminEmail: string;
  superAdminPassword: string;
  superAdminFirstName: string;
  superAdminLastName: string;
  superAdminPhone?: string;
  seedSchemaName?: string;
};

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

function parseCompanySize(input: string): CompanySize {
  const normalized = input.trim().toUpperCase();

  switch (normalized) {
    case CompanySize.STARTUP:
      return CompanySize.STARTUP;
    case CompanySize.SMALL:
      return CompanySize.SMALL;
    case CompanySize.MEDIUM:
      return CompanySize.MEDIUM;
    case CompanySize.LARGE:
      return CompanySize.LARGE;
    case CompanySize.ENTERPRISE:
      return CompanySize.ENTERPRISE;
    default:
      throw new Error(
        `Invalid SEED_COMPANY_SIZE "${input}". Allowed values: STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE.`
      );
  }
}

function buildSeedConfig(): SeedConfig {
  const website = optionalEnv('SEED_COMPANY_WEBSITE');
  const gstNumber = optionalEnv('SEED_COMPANY_GST');
  const adminPhone = optionalEnv('SEED_ADMIN_PHONE');
  const superAdminPhone = optionalEnv('SEED_SUPER_ADMIN_PHONE');
  const seedSchemaName = optionalEnv('SEED_SCHEMA_NAME');

  return {
    companyName: requiredEnv('SEED_COMPANY_NAME', 'Acme Manufacturing Pvt Ltd'),
    industry: requiredEnv('SEED_COMPANY_INDUSTRY', 'Manufacturing'),
    companySize: parseCompanySize(requiredEnv('SEED_COMPANY_SIZE', CompanySize.SMALL)),
    ...(website ? { website } : {}),
    ...(gstNumber ? { gstNumber } : {}),
    adminEmail: requiredEnv('SEED_ADMIN_EMAIL', 'admin@acme.local'),
    adminPassword: requiredEnv('SEED_ADMIN_PASSWORD', 'Admin@12345'),
    adminFirstName: requiredEnv('SEED_ADMIN_FIRST_NAME', 'Company'),
    adminLastName: requiredEnv('SEED_ADMIN_LAST_NAME', 'Admin'),
    ...(adminPhone ? { adminPhone } : {}),
    superAdminEmail: requiredEnv('SEED_SUPER_ADMIN_EMAIL', 'superadmin@avyerp.local'),
    superAdminPassword: requiredEnv('SEED_SUPER_ADMIN_PASSWORD', 'SuperAdmin@12345'),
    superAdminFirstName: requiredEnv('SEED_SUPER_ADMIN_FIRST_NAME', 'Platform'),
    superAdminLastName: requiredEnv('SEED_SUPER_ADMIN_LAST_NAME', 'Admin'),
    ...(superAdminPhone ? { superAdminPhone } : {}),
    ...(seedSchemaName ? { seedSchemaName } : {}),
  };
}

function safeSchemaName(source: string): string {
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

async function upsertCompany(config: SeedConfig) {
  const data = {
    name: config.companyName,
    industry: config.industry,
    size: config.companySize,
    website: config.website ?? null,
    gstNumber: config.gstNumber ?? null,
    address: {
      line1: 'Industrial Area',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      pincode: '411001',
    },
    contactPerson: {
      name: `${config.adminFirstName} ${config.adminLastName}`,
      email: config.adminEmail,
      phone: config.adminPhone ?? '',
    },
  };

  if (config.gstNumber) {
    const existingByGst = await prisma.company.findUnique({
      where: { gstNumber: config.gstNumber },
    });

    if (existingByGst) {
      return prisma.company.update({
        where: { id: existingByGst.id },
        data,
      });
    }
  }

  const existingByName = await prisma.company.findFirst({
    where: { name: config.companyName },
  });

  if (existingByName) {
    return prisma.company.update({
      where: { id: existingByName.id },
      data,
    });
  }

  return prisma.company.create({ data });
}

async function upsertTenant(companyId: string, config: SeedConfig) {
  const existing = await prisma.tenant.findUnique({
    where: { companyId },
  });

  const defaultSchemaName = `tenant_${safeSchemaName(config.companyName) || 'default'}`;
  const schemaName = config.seedSchemaName ?? existing?.schemaName ?? defaultSchemaName;

  if (existing) {
    return prisma.tenant.update({
      where: { id: existing.id },
      data: {
        schemaName,
        status: TenantStatus.ACTIVE,
      },
    });
  }

  return prisma.tenant.create({
    data: {
      companyId,
      schemaName,
      status: TenantStatus.ACTIVE,
    },
  });
}

async function upsertUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  companyId?: string;
}) {
  const hashedPassword = await bcrypt.hash(params.password, 12);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      password: hashedPassword,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone ?? null,
      role: params.role,
      companyId: params.companyId ?? null,
      isActive: true,
    },
    create: {
      email: params.email,
      password: hashedPassword,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone ?? null,
      role: params.role,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      isActive: true,
    },
  });
}

async function upsertSubscription(tenantId: string) {
  return prisma.subscription.upsert({
    where: { tenantId },
    update: {
      planId: 'trial',
      userTier: UserTier.STARTER,
      billingType: BillingType.MONTHLY,
      modules: {
        hr: true,
        production: true,
        inventory: true,
        sales: true,
        finance: true,
        maintenance: true,
        visitor: true,
      },
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    create: {
      tenantId,
      planId: 'trial',
      userTier: UserTier.STARTER,
      billingType: BillingType.MONTHLY,
      modules: {
        hr: true,
        production: true,
        inventory: true,
        sales: true,
        finance: true,
        maintenance: true,
        visitor: true,
      },
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

async function upsertReferenceRoles(tenantId: string) {
  const roleRecords = await Promise.all(
    Object.entries(REFERENCE_ROLE_PERMISSIONS).map(async ([roleName, roleConfig]) => {
      return prisma.role.upsert({
        where: {
          tenantId_name: {
            tenantId,
            name: roleName,
          },
        },
        update: {
          description: roleConfig.description,
          permissions: roleConfig.permissions,
          isSystem: true,
          isActive: true,
        },
        create: {
          tenantId,
          name: roleName,
          description: roleConfig.description,
          permissions: roleConfig.permissions,
          isSystem: true,
          isActive: true,
        },
      });
    })
  );

  return roleRecords;
}

async function upsertTenantUser(userId: string, tenantId: string, roleId: string) {
  return prisma.tenantUser.upsert({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    update: {
      roleId,
      isActive: true,
    },
    create: {
      userId,
      tenantId,
      roleId,
      isActive: true,
    },
  });
}

async function upsertAuditLogEntries(tenantId: string, userId: string) {
  const existing = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      userId,
      action: 'SEED_BOOTSTRAP',
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'SEED_BOOTSTRAP',
      entityType: 'SYSTEM',
      entityId: 'seed',
      newValues: {
        seededAt: new Date().toISOString(),
        note: 'Initial platform seed data created.',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'prisma-seed-script',
    },
  });
}

async function main(): Promise<void> {
  const config = buildSeedConfig();

  console.log('🌱 Starting Avy ERP seed...');

  const company = await upsertCompany(config);
  const tenant = await upsertTenant(company.id, config);

  const companyAdmin = await upsertUser({
    email: config.adminEmail,
    password: config.adminPassword,
    firstName: config.adminFirstName,
    lastName: config.adminLastName,
    ...(config.adminPhone ? { phone: config.adminPhone } : {}),
    role: UserRole.COMPANY_ADMIN,
    companyId: company.id,
  });

  const superAdmin = await upsertUser({
    email: config.superAdminEmail,
    password: config.superAdminPassword,
    firstName: config.superAdminFirstName,
    lastName: config.superAdminLastName,
    ...(config.superAdminPhone ? { phone: config.superAdminPhone } : {}),
    role: UserRole.SUPER_ADMIN,
  });

  await upsertSubscription(tenant.id);
  const roles = await upsertReferenceRoles(tenant.id);

  const defaultCompanyAdminRole = roles.find((role) => role.name === 'General Manager') ?? roles[0];
  if (!defaultCompanyAdminRole) {
    throw new Error('No tenant role found after seeding reference roles.');
  }

  await upsertTenantUser(companyAdmin.id, tenant.id, defaultCompanyAdminRole.id);
  await upsertAuditLogEntries(tenant.id, companyAdmin.id);

  console.log('✅ Seed completed successfully');
  console.log(`   Company: ${company.name} (${company.id})`);
  console.log(`   Tenant: ${tenant.schemaName} (${tenant.id})`);
  console.log(`   Company Admin: ${companyAdmin.email}`);
  console.log(`   Super Admin: ${superAdmin.email}`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
