import type { PrismaClient } from '@prisma/client';

export interface SeedContext {
  prisma: PrismaClient;
  tenantPrisma: PrismaClient;
  companyId: string;
  tenantId: string;
  months: number;
  verbose: boolean;
  dryRun: boolean;
  employeeCount: number;

  employeeIds: string[];
  managerIds: string[];
  departmentIds: string[];
  designationIds: string[];
  gradeIds: string[];
  employeeTypeIds: string[];
  locationIds: string[];
  shiftIds: string[];
  costCentreIds: string[];
  salaryComponentIds: string[];
  salaryStructureIds: string[];
  leaveTypeIds: string[];
  roleIds: { employeeRoleId: string; managerRoleId: string };
  holidays: { date: string; name: string }[];
  weeklyOffs: string[];
  timezone: string;
  gradeMap: Map<string, { id: string; code: string; name: string }>;
  employeeMap: Map<string, EmployeeSnapshot>;
}

export interface EmployeeSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  officialEmail: string;
  employeeId: string;
  departmentId: string;
  designationId: string;
  gradeId: string;
  gradeCode: string;
  employeeTypeId: string;
  locationId: string;
  shiftId: string;
  joiningDate: string;
  status: string;
  annualCtc: number;
  userId?: string;
}

export interface SeederModule {
  name: string;
  order: number;
  seed: (ctx: SeedContext) => Promise<void>;
}

export function log(module: string, msg: string): void {
  console.log(`  [${module}] ${msg}`);
}

export function vlog(ctx: SeedContext, module: string, msg: string): void {
  if (ctx.verbose) console.log(`    [${module}] ${msg}`);
}
