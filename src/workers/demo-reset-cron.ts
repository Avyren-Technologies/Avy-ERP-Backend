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
  const where = { where: { companyId } };

  // Delete in dependency order — leaf tables first
  // ESS / Workflows
  await tenantDb.approvalRequest.deleteMany(where);
  await tenantDb.approvalWorkflow.deleteMany(where);
  await tenantDb.notificationRule.deleteMany(where);
  await tenantDb.notificationTemplate.deleteMany(where);

  // Attendance & Leave
  await tenantDb.attendanceOverride.deleteMany(where);
  await tenantDb.attendanceRecord.deleteMany(where);
  await tenantDb.leaveRequest.deleteMany(where);
  await tenantDb.leaveBalance.deleteMany(where);
  await tenantDb.leavePolicy.deleteMany(where);

  // Offboarding
  await tenantDb.fnFSettlement.deleteMany(where);
  await tenantDb.exitInterview.deleteMany(where);
  await tenantDb.exitClearance.deleteMany(where);
  await tenantDb.exitRequest.deleteMany(where);

  // Payroll
  await tenantDb.employeeSalary.deleteMany(where);

  // Assets
  await tenantDb.assetAssignment.deleteMany(where);
  await tenantDb.asset.deleteMany(where);

  // Expenses & Letters
  await tenantDb.expenseClaimItem.deleteMany(where);
  await tenantDb.expenseClaim.deleteMany(where);
  await tenantDb.hRLetter.deleteMany(where);

  // Grievance & Disciplinary
  await tenantDb.grievanceCase.deleteMany(where);
  await tenantDb.disciplinaryAction.deleteMany(where);

  // Performance / Onboarding / Probation
  await tenantDb.probationReview.deleteMany(where);
  await tenantDb.onboardingTask.deleteMany(where);
  await tenantDb.onboardingTemplate.deleteMany(where);

  // IT Declarations
  await tenantDb.iTDeclaration.deleteMany(where);

  // Employee sub-records
  await tenantDb.employeeTimeline.deleteMany(where);
  await tenantDb.employeeDocument.deleteMany(where);
  await tenantDb.employeePrevEmployment.deleteMany(where);
  await tenantDb.employeeEducation.deleteMany(where);
  await tenantDb.employeeNominee.deleteMany(where);

  // Employee master
  await tenantDb.employee.deleteMany(where);

  // Org structure
  await tenantDb.leaveType.deleteMany(where);
  await tenantDb.designation.deleteMany(where);
  await tenantDb.department.deleteMany(where);

  // Analytics
  await tenantDb.employeeAnalyticsDaily.deleteMany(where);
  await tenantDb.attendanceAnalyticsDaily.deleteMany(where);
  await tenantDb.payrollAnalyticsMonthly.deleteMany(where);
  await tenantDb.attritionMetricsMonthly.deleteMany(where);
  await tenantDb.analyticsAlert.deleteMany(where);

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
