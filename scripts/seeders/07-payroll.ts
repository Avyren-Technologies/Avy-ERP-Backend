import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  getPastMonths,
  getWorkingDays,
  randomInt,
  randomDecimal,
} from './utils';

const PF_WAGE_CEILING = 15000;
const ESI_GROSS_CEILING = 21000;
const PT_DEFAULT = 200;

interface SalaryBreakdown {
  basic: number;
  hra: number;
  specialAllowance: number;
  conveyance: number;
  medical: number;
  grossMonthly: number;
}

function computeSalaryBreakdown(annualCtc: number): SalaryBreakdown {
  const grossMonthly = Math.round(annualCtc / 12);
  const basic = Math.round(grossMonthly * 0.40);
  const hra = Math.round(basic * 0.50);
  const conveyance = 1600;
  const medical = 1250;
  const specialAllowance = grossMonthly - basic - hra - conveyance - medical;
  return { basic, hra, specialAllowance, conveyance, medical, grossMonthly };
}

function computeDeductions(sal: SalaryBreakdown): {
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  totalDeductions: number;
} {
  // PF: 12% of basic, capped at PF wage ceiling
  const pfWage = Math.min(sal.basic, PF_WAGE_CEILING);
  const pfEmployee = Math.round(pfWage * 0.12);
  const pfEmployer = Math.round(pfWage * 0.12);

  // ESI: only if gross < 21000
  const esiEmployee = sal.grossMonthly < ESI_GROSS_CEILING
    ? Math.round(sal.grossMonthly * 0.0075)
    : 0;
  const esiEmployer = sal.grossMonthly < ESI_GROSS_CEILING
    ? Math.round(sal.grossMonthly * 0.0325)
    : 0;

  // PT: Karnataka default
  const pt = PT_DEFAULT;

  // TDS: rough estimate (annual taxable income / 12)
  const annualGross = sal.grossMonthly * 12;
  const annualPf = pfEmployee * 12;
  const standardDeduction = 50000;
  const taxableIncome = annualGross - annualPf - standardDeduction;
  let annualTax = 0;
  if (taxableIncome > 1500000) {
    annualTax = taxableIncome * 0.30 - 150000;
  } else if (taxableIncome > 1200000) {
    annualTax = taxableIncome * 0.20 - 60000;
  } else if (taxableIncome > 900000) {
    annualTax = taxableIncome * 0.15 - 15000;
  } else if (taxableIncome > 600000) {
    annualTax = taxableIncome * 0.10;
  } else if (taxableIncome > 300000) {
    annualTax = taxableIncome * 0.05;
  }
  const tds = Math.max(0, Math.round(annualTax / 12));

  const totalDeductions = pfEmployee + esiEmployee + pt + tds;

  return { pfEmployee, pfEmployer, esiEmployee, esiEmployer, pt, tds, totalDeductions };
}

const seed = async (ctx: SeedContext): Promise<void> => {
  const pastMonths = getPastMonths(ctx.months);
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );

  let totalRuns = 0;
  let totalEntries = 0;
  let totalPayslips = 0;

  for (let mi = 0; mi < pastMonths.length; mi++) {
    const { year, month } = pastMonths[mi];
    const workingDays = getWorkingDays(year, month, ctx.weeklyOffs, ctx.holidays);
    const totalWorkingDays = workingDays.length;

    // Determine payroll run status based on age
    let runStatus: string;
    if (mi === 0) {
      runStatus = 'DISBURSED'; // oldest month
    } else if (mi < pastMonths.length - 1) {
      runStatus = 'APPROVED';
    } else {
      runStatus = 'COMPUTED'; // most recent
    }

    // Create PayrollRun
    let payrollRun;
    try {
      payrollRun = await ctx.prisma.payrollRun.create({
        data: {
          month,
          year,
          status: runStatus as any,
          employeeCount: activeEmployees.length,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
          companyId: ctx.companyId,
          computedAt: new Date(),
          approvedAt: runStatus === 'APPROVED' || runStatus === 'DISBURSED' ? new Date() : undefined,
          disbursedAt: runStatus === 'DISBURSED' ? new Date() : undefined,
        },
      });
    } catch {
      vlog(ctx, 'payroll', `PayrollRun ${year}-${month} already exists, skipping`);
      continue;
    }

    totalRuns++;

    let runTotalGross = 0;
    let runTotalDeductions = 0;
    let runTotalNet = 0;

    const entries: Parameters<typeof ctx.prisma.payrollEntry.createMany>[0]['data'] = [];
    const payslips: Parameters<typeof ctx.prisma.payslip.createMany>[0]['data'] = [];

    for (const emp of activeEmployees) {
      // Skip if employee joined after this month
      const joinDate = new Date(emp.joiningDate);
      if (joinDate.getFullYear() > year || (joinDate.getFullYear() === year && joinDate.getMonth() + 1 > month)) {
        continue;
      }

      const sal = computeSalaryBreakdown(emp.annualCtc);
      const ded = computeDeductions(sal);

      const lopDays = randomDecimal(0, 2, 1);
      const presentDays = Math.max(0, totalWorkingDays - lopDays);

      // Pro-rate gross for LOP
      const lopRatio = lopDays / totalWorkingDays;
      const lopDeduction = Math.round(sal.grossMonthly * lopRatio);
      const adjustedGross = sal.grossMonthly - lopDeduction;
      const netPay = adjustedGross - ded.totalDeductions;

      const earnings = {
        BASIC: Math.round(sal.basic * (1 - lopRatio)),
        HRA: Math.round(sal.hra * (1 - lopRatio)),
        SPECIAL_ALLOWANCE: Math.round(sal.specialAllowance * (1 - lopRatio)),
        CONVEYANCE: sal.conveyance,
        MEDICAL: sal.medical,
      };

      const deductions = {
        PF_EE: ded.pfEmployee,
        ESI_EE: ded.esiEmployee,
        PT: ded.pt,
        TDS: ded.tds,
      };

      const employerContributions = {
        PF_EMPLOYER: ded.pfEmployer,
        ESI_EMPLOYER: ded.esiEmployer,
      };

      entries.push({
        payrollRunId: payrollRun.id,
        employeeId: emp.id,
        grossEarnings: adjustedGross,
        totalDeductions: ded.totalDeductions,
        netPay: Math.max(0, netPay),
        earnings,
        deductions,
        employerContributions,
        workingDays: totalWorkingDays,
        presentDays,
        lopDays,
        pfEmployee: ded.pfEmployee,
        pfEmployer: ded.pfEmployer,
        esiEmployee: ded.esiEmployee,
        esiEmployer: ded.esiEmployer,
        ptAmount: ded.pt,
        tdsAmount: ded.tds,
        companyId: ctx.companyId,
      });

      runTotalGross += adjustedGross;
      runTotalDeductions += ded.totalDeductions;
      runTotalNet += Math.max(0, netPay);

      // Create Payslip for DISBURSED or APPROVED runs
      if (runStatus === 'DISBURSED' || runStatus === 'APPROVED') {
        const monthStr = String(month).padStart(2, '0');
        payslips.push({
          payrollRunId: payrollRun.id,
          employeeId: emp.id,
          month,
          year,
          grossEarnings: adjustedGross,
          totalDeductions: ded.totalDeductions,
          netPay: Math.max(0, netPay),
          earnings,
          deductions,
          employerContributions,
          pfEmployee: ded.pfEmployee,
          pfEmployer: ded.pfEmployer,
          esiEmployee: ded.esiEmployee,
          esiEmployer: ded.esiEmployer,
          ptAmount: ded.pt,
          tdsAmount: ded.tds,
          workingDays: totalWorkingDays,
          presentDays,
          lopDays,
          companyId: ctx.companyId,
        });
      }
    }

    // Bulk insert entries
    if (entries.length > 0) {
      const entryResult = await ctx.prisma.payrollEntry.createMany({
        data: entries,
        skipDuplicates: true,
      });
      totalEntries += entryResult.count;
    }

    // Bulk insert payslips
    if (payslips.length > 0) {
      const payslipResult = await ctx.prisma.payslip.createMany({
        data: payslips,
        skipDuplicates: true,
      });
      totalPayslips += payslipResult.count;
    }

    // Update payroll run totals
    await ctx.prisma.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        totalGross: runTotalGross,
        totalDeductions: runTotalDeductions,
        totalNet: runTotalNet,
        employeeCount: entries.length,
      },
    });

    vlog(ctx, 'payroll', `${year}-${String(month).padStart(2, '0')}: ${entries.length} entries, status=${runStatus}`);
  }

  log('payroll', `Created ${totalRuns} payroll runs with ${totalEntries} entries and ${totalPayslips} payslips`);
};

const module: SeederModule = {
  name: 'payroll',
  order: 7,
  seed,
};

export default module;
