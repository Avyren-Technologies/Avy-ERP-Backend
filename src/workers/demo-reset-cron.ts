import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { tenantConnectionManager } from '../config/tenant-connection-manager';
import { hashPassword } from '../shared/utils';
import { logger } from '../config/logger';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_LEAVE_TYPES,
} from '../shared/constants/company-defaults';
import { resetDemoTenantCache } from '../shared/utils/demo-guard';

let job: cron.ScheduledTask | null = null;

const DEMO_SLUG = 'demo';
const DEMO_ADMIN_EMAIL = 'demo-admin@avyerp.com';
const DEMO_USER_EMAIL = 'demo-user@avyerp.com';
const DEMO_PASSWORD = 'demo123';

// ─── Core Reset Logic ───

async function resetDemoTenant(): Promise<void> {
  const startTime = Date.now();
  logger.info('demo_reset_start', { message: 'Starting demo tenant reset' });

  // 1. Find the demo tenant
  const tenant = await platformPrisma.tenant.findFirst({
    where: { slug: DEMO_SLUG },
    select: { id: true, companyId: true, schemaName: true },
  });

  if (!tenant) {
    logger.info('demo_reset_skip', { message: 'Demo tenant not found, skipping reset' });
    return;
  }

  // 2. Get tenant Prisma client
  const tenantDb = tenantConnectionManager.getClient({ schemaName: tenant.schemaName });

  // 3. Wipe tenant-scoped data (order matters for FK constraints — children first)
  await wipeTenantData(tenantDb, tenant.companyId);

  // 4. Re-seed fresh demo data
  await seedDemoData(tenantDb, tenant.companyId);

  // 5. Reset demo user passwords
  const hashedPassword = await hashPassword(DEMO_PASSWORD);
  await platformPrisma.user.updateMany({
    where: {
      email: { in: [DEMO_ADMIN_EMAIL, DEMO_USER_EMAIL] },
      companyId: tenant.companyId,
    },
    data: { password: hashedPassword },
  });

  // 6. Reset the cached demo tenant ID
  resetDemoTenantCache();

  const elapsed = Date.now() - startTime;
  logger.info('demo_reset_complete', { message: `Demo tenant reset completed in ${elapsed}ms` });
}

async function wipeTenantData(tenantDb: PrismaClient, companyId: string): Promise<void> {
  // Demo schema is isolated — safe to wipe all records with deleteMany({}).
  // Using empty where clause avoids TS errors for models that don't have companyId.
  const all = {};

  // Delete in dependency order — leaf tables first
  // ESS / Workflows
  await tenantDb.approvalRequest.deleteMany(all);
  await tenantDb.approvalWorkflow.deleteMany(all);
  await tenantDb.notificationRule.deleteMany(all);
  await tenantDb.notificationTemplate.deleteMany(all);

  // Attendance & Leave
  await tenantDb.attendanceOverride.deleteMany(all);
  await tenantDb.attendanceRecord.deleteMany(all);
  await tenantDb.leaveRequest.deleteMany(all);
  await tenantDb.leaveBalance.deleteMany(all);
  await tenantDb.leavePolicy.deleteMany(all);

  // Offboarding
  await tenantDb.fnFSettlement.deleteMany(all);
  await tenantDb.exitInterview.deleteMany(all);
  await tenantDb.exitClearance.deleteMany(all);
  await tenantDb.exitRequest.deleteMany(all);

  // Payroll
  await tenantDb.employeeSalary.deleteMany(all);

  // Assets
  await tenantDb.assetAssignment.deleteMany(all);
  await tenantDb.asset.deleteMany(all);

  // Expenses & Letters
  await tenantDb.expenseClaimItem.deleteMany(all);
  await tenantDb.expenseClaim.deleteMany(all);
  await tenantDb.hRLetter.deleteMany(all);

  // Grievance & Disciplinary
  await tenantDb.grievanceCase.deleteMany(all);
  await tenantDb.disciplinaryAction.deleteMany(all);

  // Performance / Onboarding / Probation
  await tenantDb.probationReview.deleteMany(all);
  await tenantDb.onboardingTask.deleteMany(all);
  await tenantDb.onboardingTemplate.deleteMany(all);

  // IT Declarations
  await tenantDb.iTDeclaration.deleteMany(all);

  // Employee sub-records
  await tenantDb.employeeTimeline.deleteMany(all);
  await tenantDb.employeeDocument.deleteMany(all);
  await tenantDb.employeePrevEmployment.deleteMany(all);
  await tenantDb.employeeEducation.deleteMany(all);
  await tenantDb.employeeNominee.deleteMany(all);

  // Employee master
  await tenantDb.employee.deleteMany(all);

  // Org structure
  await tenantDb.leaveType.deleteMany(all);
  await tenantDb.designation.deleteMany(all);
  await tenantDb.department.deleteMany(all);

  // Analytics
  await tenantDb.employeeAnalyticsDaily.deleteMany(all);
  await tenantDb.attendanceAnalyticsDaily.deleteMany(all);
  await tenantDb.payrollAnalyticsMonthly.deleteMany(all);
  await tenantDb.attritionMetricsMonthly.deleteMany(all);
  await tenantDb.analyticsAlert.deleteMany(all);

  logger.info('demo_reset_wipe_done', { companyId });
}

async function seedDemoData(tenantDb: PrismaClient, companyId: string): Promise<void> {
  // Seed departments (a subset)
  const deptSubset = DEFAULT_DEPARTMENTS.slice(0, 4); // EXEC, HR, FIN, OPS
  await tenantDb.department.createMany({
    data: deptSubset.map((d) => ({
      companyId,
      code: d.code,
      name: d.name,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  // Seed designations (a subset)
  const desigSubset = DEFAULT_DESIGNATIONS.slice(0, 6); // CEO through SM
  await tenantDb.designation.createMany({
    data: desigSubset.map((d) => ({
      companyId,
      code: d.code,
      name: d.name,
      jobLevel: d.jobLevel,
      managerialFlag: d.managerialFlag,
      probationDays: d.probationDays,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  // Seed leave types
  await tenantDb.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((lt) => ({
      companyId,
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

  logger.info('demo_reset_seed_done', { companyId });
}

// ─── Cron Lifecycle ───

export function startDemoResetCron(): void {
  if (job) return;

  logger.info('demo_reset_cron_starting', { message: 'Scheduling demo reset cron (daily at 2 AM)' });

  job = cron.schedule('0 2 * * *', async () => {
    try {
      await resetDemoTenant();
    } catch (err) {
      logger.error('demo_reset_cron_error', { error: err });
    }
  });
}

export function stopDemoResetCron(): void {
  if (job) {
    job.stop();
    job = null;
    logger.info('demo_reset_cron_stopped', { message: 'Demo reset cron stopped' });
  }
}
