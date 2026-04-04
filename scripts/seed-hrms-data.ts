#!/usr/bin/env npx tsx
// ============================================================
// Seed HRMS Data — Populates a tenant with realistic HRMS data.
//
// Loads modular seeders from scripts/seeders/ in dependency order
// and feeds them a shared SeedContext with master data from the DB.
//
// Usage:
//   npx tsx scripts/seed-hrms-data.ts --company-id <id>
//   npx tsx scripts/seed-hrms-data.ts --company-id <id> --months 6 --employees 50
//   npx tsx scripts/seed-hrms-data.ts --company-id <id> --only employees,attendance
//   npx tsx scripts/seed-hrms-data.ts --company-id <id> --verbose --dry-run
//
// Options:
//   --company-id   (required) Company ID to seed data for
//   --months       Number of past months to generate data (default: 3)
//   --employees    Number of employees to create (default: 30)
//   --only         Comma-separated list of seeder names to run
//   --verbose      Print detailed progress logs
//   --dry-run      Validate setup without writing data
// ============================================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import type { SeedContext, SeederModule, EmployeeSnapshot } from './seeders/types';
import { log } from './seeders/types';

// ── CLI Argument Parsing ──

function parseArgs(): {
  companyId: string;
  months: number;
  employeeCount: number;
  only: string[] | null;
  verbose: boolean;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let companyId = '';
  let months = 3;
  let employeeCount = 30;
  let only: string[] | null = null;
  let verbose = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--company-id':
        companyId = args[++i] || '';
        break;
      case '--months':
        months = parseInt(args[++i] || '3', 10);
        break;
      case '--employees':
        employeeCount = parseInt(args[++i] || '30', 10);
        break;
      case '--only':
        only = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  if (!companyId) {
    console.error('Error: --company-id is required');
    console.error('Usage: npx tsx scripts/seed-hrms-data.ts --company-id <id> [--months 3] [--employees 30]');
    process.exit(1);
  }

  return { companyId, months, employeeCount, only, verbose, dryRun };
}

// ── Tenant Prisma Client ──

function createTenantPrisma(schemaName: string): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const tenantDbUrl = databaseUrl.includes('?')
    ? `${databaseUrl}&schema=${schemaName}`
    : `${databaseUrl}?schema=${schemaName}`;

  return new PrismaClient({
    datasources: { db: { url: tenantDbUrl } },
  });
}

// ── Load Seeder Modules ──

async function loadSeeders(only: string[] | null): Promise<SeederModule[]> {
  const seedersDir = path.join(__dirname, 'seeders');
  const files = fs.readdirSync(seedersDir).filter(f =>
    f.endsWith('.ts') && !f.startsWith('types') && !f.startsWith('utils') && !f.startsWith('index'),
  );

  const modules: SeederModule[] = [];

  for (const file of files) {
    const mod = await import(path.join(seedersDir, file));
    // Support both `export default { name, order, seed }` and `export const seeder = { ... }`
    const seeder: SeederModule | undefined =
      (mod.default && typeof mod.default.seed === 'function') ? mod.default :
      (mod.seeder && typeof mod.seeder.seed === 'function') ? mod.seeder :
      undefined;
    if (seeder) {
      if (!only || only.includes(seeder.name)) {
        modules.push(seeder);
      }
    }
  }

  // Sort by dependency order
  modules.sort((a, b) => a.order - b.order);
  return modules;
}

// ── Fetch Master Data ──

async function buildSeedContext(
  prisma: PrismaClient,
  tenantPrisma: PrismaClient,
  companyId: string,
  tenantId: string,
  opts: { months: number; employeeCount: number; verbose: boolean; dryRun: boolean },
): Promise<SeedContext> {
  console.log('\n  Fetching master data from DB...');

  // Fetch org structure from tenant DB (these use status: "Active", not isActive)
  const [departments, designations, grades, employeeTypes, costCentres] = await Promise.all([
    prisma.department.findMany({ where: { companyId, status: 'Active' } }),
    prisma.designation.findMany({ where: { companyId, status: 'Active' } }),
    prisma.grade.findMany({ where: { companyId, status: 'Active' } }),
    prisma.employeeType.findMany({ where: { companyId, status: 'Active' } }),
    prisma.costCentre.findMany({ where: { companyId } }),
  ]);

  // Fetch locations and shifts from tenant DB (company-admin models)
  const [locations, shifts] = await Promise.all([
    prisma.location.findMany({ where: { companyId, status: 'Active' } }),
    prisma.companyShift.findMany({ where: { companyId } }),
  ]);

  // Fetch payroll config from tenant DB (these use isActive: Boolean)
  const [salaryComponents, salaryStructures, leaveTypes] = await Promise.all([
    prisma.salaryComponent.findMany({ where: { companyId, isActive: true } }),
    prisma.salaryStructure.findMany({ where: { companyId, isActive: true } }),
    prisma.leaveType.findMany({ where: { companyId, isActive: true } }),
  ]);

  // Fetch roles from platform DB
  const roles = await prisma.role.findMany({
    where: { tenantId },
  });
  const employeeRole = roles.find(r => r.name.toLowerCase().includes('employee'));
  const managerRole = roles.find(r => r.name.toLowerCase().includes('manager'));

  if (!employeeRole || !managerRole) {
    console.warn('  Warning: Could not find Employee or Manager roles. Using first two roles as fallback.');
  }

  // Fetch holidays for current year from tenant DB
  const currentYear = new Date().getFullYear();
  const holidayRecords = await prisma.holidayCalendar.findMany({
    where: { companyId, year: currentYear },
  });
  const holidays = holidayRecords.map(h => ({
    date: h.date instanceof Date ? h.date.toISOString().split('T')[0] : String(h.date).split('T')[0],
    name: h.name,
  }));

  // Fetch company settings from platform DB
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const weeklyOffs = (company.weeklyOffs as string[] | null) || ['Sunday'];

  // Fetch timezone from CompanySettings in tenant DB
  const companySettings = await prisma.companySettings.findUnique({
    where: { companyId },
  });
  const timezone = companySettings?.timezone || 'Asia/Kolkata';

  // Fetch existing employees from tenant DB
  const existingEmployees = await prisma.employee.findMany({
    where: { companyId },
    include: { grade: true },
  });

  const employeeMap = new Map<string, EmployeeSnapshot>();
  for (const emp of existingEmployees) {
    employeeMap.set(emp.id, {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      officialEmail: emp.officialEmail || '',
      employeeId: emp.employeeId,
      departmentId: emp.departmentId,
      designationId: emp.designationId,
      gradeId: emp.gradeId || '',
      gradeCode: emp.grade?.code || '',
      employeeTypeId: emp.employeeTypeId,
      locationId: emp.locationId || '',
      shiftId: emp.shiftId || '',
      joiningDate: emp.joiningDate instanceof Date ? emp.joiningDate.toISOString().split('T')[0] : String(emp.joiningDate).split('T')[0],
      status: emp.status,
      annualCtc: emp.annualCtc ? Number(emp.annualCtc) : 0,
    });
  }

  // Build grade map
  const gradeMap = new Map<string, { id: string; code: string; name: string }>();
  for (const g of grades) {
    gradeMap.set(g.id, { id: g.id, code: g.code, name: g.name });
  }

  // Log summary
  console.log(`    Departments: ${departments.length}`);
  console.log(`    Designations: ${designations.length}`);
  console.log(`    Grades: ${grades.length}`);
  console.log(`    Employee Types: ${employeeTypes.length}`);
  console.log(`    Locations: ${locations.length}`);
  console.log(`    Shifts: ${shifts.length}`);
  console.log(`    Cost Centres: ${costCentres.length}`);
  console.log(`    Salary Components: ${salaryComponents.length}`);
  console.log(`    Salary Structures: ${salaryStructures.length}`);
  console.log(`    Leave Types: ${leaveTypes.length}`);
  console.log(`    Holidays (${currentYear}): ${holidays.length}`);
  console.log(`    Weekly Offs: ${weeklyOffs.join(', ')}`);
  console.log(`    Timezone: ${timezone}`);
  console.log(`    Existing Employees: ${existingEmployees.length}`);

  // Validate minimum requirements
  if (departments.length === 0) throw new Error('No departments found. Run company setup first.');
  if (designations.length === 0) throw new Error('No designations found. Run company setup first.');
  if (employeeTypes.length === 0) throw new Error('No employee types found. Run company setup first.');

  return {
    prisma,
    tenantPrisma,
    companyId,
    tenantId,
    months: opts.months,
    verbose: opts.verbose,
    dryRun: opts.dryRun,
    employeeCount: opts.employeeCount,

    employeeIds: existingEmployees.map(e => e.id),
    managerIds: [],
    departmentIds: departments.map(d => d.id),
    designationIds: designations.map(d => d.id),
    gradeIds: grades.map(g => g.id),
    employeeTypeIds: employeeTypes.map(e => e.id),
    locationIds: locations.map(l => l.id),
    shiftIds: shifts.map(s => s.id),
    costCentreIds: costCentres.map(c => c.id),
    salaryComponentIds: salaryComponents.map(s => s.id),
    salaryStructureIds: salaryStructures.map(s => s.id),
    leaveTypeIds: leaveTypes.map(l => l.id),
    roleIds: {
      employeeRoleId: employeeRole?.id || roles[0]?.id || '',
      managerRoleId: managerRole?.id || roles[1]?.id || roles[0]?.id || '',
    },
    holidays,
    weeklyOffs,
    timezone,
    gradeMap,
    employeeMap,
  };
}

// ── Main ──

async function main(): Promise<void> {
  const startTime = Date.now();
  const opts = parseArgs();

  console.log('=== HRMS Data Seeder ===');
  console.log(`  Company ID: ${opts.companyId}`);
  console.log(`  Months: ${opts.months}`);
  console.log(`  Employees: ${opts.employeeCount}`);
  if (opts.only) console.log(`  Only: ${opts.only.join(', ')}`);
  if (opts.verbose) console.log(`  Verbose: ON`);
  if (opts.dryRun) console.log(`  Dry Run: ON (no data will be written)`);

  // Connect to platform DB
  const prisma = new PrismaClient();

  try {
    // Resolve tenant for company
    const tenant = await prisma.tenant.findFirst({
      where: { companyId: opts.companyId },
    });

    if (!tenant) {
      throw new Error(`No tenant found for company ${opts.companyId}`);
    }

    console.log(`\n  Tenant: ${tenant.slug} (schema: ${tenant.schemaName})`);

    // Create tenant-scoped Prisma client
    const tenantPrisma = createTenantPrisma(tenant.schemaName);

    try {
      // Build context with all master data
      const ctx = await buildSeedContext(prisma, tenantPrisma, opts.companyId, tenant.id, opts);

      // Load and run seeders
      const seeders = await loadSeeders(opts.only);

      if (seeders.length === 0) {
        console.log('\n  No seeder modules found. Add seeder files to scripts/seeders/');
        console.log('  Each seeder should export default: { name, order, seed }');
        return;
      }

      console.log(`\n  Found ${seeders.length} seeder module(s): ${seeders.map(s => s.name).join(', ')}`);

      const results: { name: string; status: 'success' | 'skipped' | 'error'; error?: string; durationMs: number }[] = [];

      for (const seeder of seeders) {
        const seederStart = Date.now();
        console.log(`\n  ── Running: ${seeder.name} (order: ${seeder.order}) ──`);

        if (opts.dryRun) {
          log(seeder.name, 'Skipped (dry run)');
          results.push({ name: seeder.name, status: 'skipped', durationMs: 0 });
          continue;
        }

        try {
          await seeder.seed(ctx);
          const durationMs = Date.now() - seederStart;
          log(seeder.name, `Done (${durationMs}ms)`);
          results.push({ name: seeder.name, status: 'success', durationMs });
        } catch (err) {
          const durationMs = Date.now() - seederStart;
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`  [${seeder.name}] ERROR: ${errorMsg}`);
          if (opts.verbose && err instanceof Error && err.stack) {
            console.error(`    ${err.stack}`);
          }
          results.push({ name: seeder.name, status: 'error', error: errorMsg, durationMs });
        }
      }

      // Print summary
      const totalMs = Date.now() - startTime;
      console.log('\n=== Seed Summary ===');
      console.log(`  Total time: ${(totalMs / 1000).toFixed(1)}s`);
      console.log(`  Employees in context: ${ctx.employeeIds.length}`);
      console.log('');

      for (const r of results) {
        const icon = r.status === 'success' ? 'OK' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
        const suffix = r.status === 'error' ? ` — ${r.error}` : '';
        console.log(`  [${icon}] ${r.name} (${r.durationMs}ms)${suffix}`);
      }

      const failures = results.filter(r => r.status === 'error');
      if (failures.length > 0) {
        console.log(`\n  ${failures.length} seeder(s) failed. Check errors above.`);
      }

      console.log('');
    } finally {
      await tenantPrisma.$disconnect();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
