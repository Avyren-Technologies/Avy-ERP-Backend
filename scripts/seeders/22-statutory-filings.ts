import type { SeederModule } from './types';
import { log, vlog } from './types';
import { getPastMonths, randomInt, randomDecimal } from './utils';

const MODULE = 'statutory-filings';

export const seeder: SeederModule = {
  name: 'Statutory Filings',
  order: 22,
  seed: async (ctx) => {
    const { prisma, companyId, months, employeeIds } = ctx;

    // Check existing filings
    const existingFilings = await prisma.statutoryFiling.count({ where: { companyId } });
    if (existingFilings >= 10) {
      log(MODULE, `Skipping — ${existingFilings} statutory filings already exist`);
      return;
    }

    const pastMonths = getPastMonths(months);
    const totalEmployees = employeeIds.length;
    let created = 0;

    for (const { year, month } of pastMonths) {
      const dueDate = new Date(year, month, 15); // 15th of next month
      const filedDate = new Date(year, month, randomInt(10, 14));

      // ── PF ECR (monthly) ──
      const pfAmount = Math.round(totalEmployees * 15000 * 0.24); // ~24% of wage ceiling
      await prisma.statutoryFiling.create({
        data: {
          companyId,
          type: 'PF_ECR',
          month,
          year,
          status: 'FILED',
          amount: pfAmount,
          filedAt: filedDate,
          filedBy: 'system-seed',
          dueDate,
          details: {
            employeeCount: totalEmployees,
            employeeShare: Math.round(pfAmount / 2),
            employerShare: Math.round(pfAmount / 2),
            adminCharges: Math.round(pfAmount * 0.02),
          },
        },
      });
      created++;

      // ── ESI Challan (monthly) ──
      const esiEligibleCount = Math.floor(totalEmployees * 0.3); // ~30% under ESI ceiling
      const esiAmount = Math.round(esiEligibleCount * 21000 * 0.04); // ~4% total
      await prisma.statutoryFiling.create({
        data: {
          companyId,
          type: 'ESI_CHALLAN',
          month,
          year,
          status: 'FILED',
          amount: esiAmount,
          filedAt: filedDate,
          filedBy: 'system-seed',
          dueDate,
          details: {
            eligibleEmployees: esiEligibleCount,
            employeeShare: Math.round(esiAmount * 0.1875), // 0.75/4
            employerShare: Math.round(esiAmount * 0.8125), // 3.25/4
          },
        },
      });
      created++;

      // ── PT Challan (monthly) ──
      const ptAmount = totalEmployees * 200; // avg PT per employee
      await prisma.statutoryFiling.create({
        data: {
          companyId,
          type: 'PT_CHALLAN',
          month,
          year,
          status: 'FILED',
          amount: ptAmount,
          filedAt: filedDate,
          filedBy: 'system-seed',
          dueDate,
          details: {
            state: 'Karnataka',
            employeeCount: totalEmployees,
          },
        },
      });
      created++;

      // ── TDS 24Q (quarterly — filed in months 6, 9, 12, 3) ──
      const quarterEndMonths = [3, 6, 9, 12]; // Mar, Jun, Sep, Dec
      if (quarterEndMonths.includes(month)) {
        const quarterNames: Record<number, string> = { 6: 'Q1', 9: 'Q2', 12: 'Q3', 3: 'Q4' };
        const avgMonthlySalary = 75000; // avg per employee
        const quarterlyTds = Math.round(totalEmployees * avgMonthlySalary * 3 * 0.1); // ~10% TDS

        await prisma.statutoryFiling.create({
          data: {
            companyId,
            type: 'TDS_24Q',
            month,
            year,
            status: 'FILED',
            amount: quarterlyTds,
            filedAt: new Date(year, month, randomInt(20, 28)),
            filedBy: 'system-seed',
            dueDate: new Date(year, month + 1, 15),
            details: {
              quarter: quarterNames[month] || `Q-${month}`,
              employeeCount: totalEmployees,
              totalSalaryDisbursed: totalEmployees * avgMonthlySalary * 3,
              totalTdsDeducted: quarterlyTds,
            },
          },
        });
        created++;
      }
    }

    log(MODULE, `Created ${created} statutory filing records`);
  },
};
