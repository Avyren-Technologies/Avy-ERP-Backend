import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

type SeedConfig = {
  superAdminEmail: string;
  superAdminPassword: string;
  superAdminFirstName: string;
  superAdminLastName: string;
  superAdminPhone?: string;
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

function buildSeedConfig(): SeedConfig {
  const superAdminPhone = optionalEnv('SEED_SUPER_ADMIN_PHONE');

  return {
    superAdminEmail: requiredEnv('SEED_SUPER_ADMIN_EMAIL', 'superadmin@avyrentechnologies.com'),
    superAdminPassword: requiredEnv('SEED_SUPER_ADMIN_PASSWORD', 'Password@123'),
    superAdminFirstName: requiredEnv('SEED_SUPER_ADMIN_FIRST_NAME', 'Platform'),
    superAdminLastName: requiredEnv('SEED_SUPER_ADMIN_LAST_NAME', 'Admin'),
    ...(superAdminPhone ? { superAdminPhone } : {}),
  };
}

async function upsertSuperAdminUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const hashedPassword = await bcrypt.hash(params.password, 12);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      password: hashedPassword,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone ?? null,
      role: UserRole.SUPER_ADMIN,
      companyId: null,
      isActive: true,
    },
    create: {
      email: params.email,
      password: hashedPassword,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone ?? null,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  const config = buildSeedConfig();

  console.log('🌱 Starting Avy ERP seed (super admin only)...');

  const superAdmin = await upsertSuperAdminUser({
    email: config.superAdminEmail,
    password: config.superAdminPassword,
    firstName: config.superAdminFirstName,
    lastName: config.superAdminLastName,
    ...(config.superAdminPhone ? { phone: config.superAdminPhone } : {}),
  });

  console.log('✅ Seed completed successfully');
  console.log(`   Super Admin: ${superAdmin.email} (${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
