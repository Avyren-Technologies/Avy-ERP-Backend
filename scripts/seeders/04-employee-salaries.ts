import type { SeederModule } from './types';
import { log, vlog } from './types';

const MODULE = 'employee-salaries';

interface ComponentBreakup {
  componentCode: string;
  componentId: string;
  calculationMethod: string;
  value: number;
  monthlyAmount: number;
  annualAmount: number;
}

export const seeder: SeederModule = {
  name: 'Employee Salaries',
  order: 4,
  seed: async (ctx) => {
    const { prisma, companyId } = ctx;

    // Find employees who already have a current salary — we'll skip only those
    const existingSalaries = await prisma.employeeSalary.findMany({
      where: { companyId, isCurrent: true },
      select: { employeeId: true },
    });
    const employeesWithSalary = new Set(existingSalaries.map((s) => s.employeeId));

    // Load salary structures with their grade associations
    const structures = await prisma.salaryStructure.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, components: true, applicableGradeIds: true },
    });

    if (structures.length === 0) {
      log(MODULE, 'No salary structures found — skipping salary assignment');
      return;
    }

    // Load salary components for code lookup
    const salaryComponents = await prisma.salaryComponent.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, type: true, calculationMethod: true, formulaValue: true },
    });
    const componentById = new Map(salaryComponents.map((c) => [c.id, c]));

    // Map structure code to structure
    const structureByCode = new Map(structures.map((s) => [s.code, s]));

    const getStructureForGrade = (gradeCode: string) => {
      if (gradeCode === 'G1' || gradeCode === 'G2') return structureByCode.get('STD-JR');
      if (gradeCode === 'G3') return structureByCode.get('STD-MID');
      if (gradeCode === 'G4' || gradeCode === 'G5') return structureByCode.get('STD-SR');
      // Fallback to first available
      return structures[0];
    };

    let created = 0;

    if (employeesWithSalary.size > 0) {
      log(MODULE, `${employeesWithSalary.size} employees already have salaries — skipping those`);
    }

    for (const [employeeId, emp] of ctx.employeeMap) {
      if (employeesWithSalary.has(employeeId)) continue;

      const structure = getStructureForGrade(emp.gradeCode);
      if (!structure) continue;

      const annualCtc = emp.annualCtc;
      const structComponents = structure.components as Array<{
        componentId: string;
        calculationMethod: string;
        value: number;
      }>;

      // Step 1: Compute gross (CTC minus employer contributions)
      // Employer contributions are typically PF_ER (12% of Basic) and ESI_ER (3.25% of Gross)
      // For simplicity: Gross ~ CTC / (1 + employer_cost_factor)
      // Basic = 40% of Gross, PF_ER = 12% of Basic = 4.8% of Gross, ESI_ER = 3.25% of Gross
      // CTC = Gross + 4.8% of Gross + 3.25% of Gross = Gross * 1.0805
      // Gross = CTC / 1.0805
      const annualGross = Math.round(annualCtc / 1.0805);
      const monthlyGross = Math.round(annualGross / 12);

      // Step 2: Compute component breakup
      const breakup: ComponentBreakup[] = [];
      let basicAnnual = 0;

      // First pass: compute BASIC and PERCENT_OF_GROSS components
      for (const sc of structComponents) {
        const comp = componentById.get(sc.componentId);
        if (!comp) continue;

        let annualAmount = 0;

        if (sc.calculationMethod === 'PERCENT_OF_GROSS') {
          annualAmount = Math.round((annualGross * sc.value) / 100);
          if (comp.code === 'BASIC') basicAnnual = annualAmount;
        } else if (sc.calculationMethod === 'FIXED') {
          // Fixed amounts are per month — will be computed after basic
          continue; // handle in second pass
        } else if (sc.calculationMethod === 'PERCENT_OF_BASIC') {
          continue; // handle in second pass
        } else if (sc.calculationMethod === 'FORMULA') {
          continue; // skip formula-based (TDS computed at runtime)
        }

        if (annualAmount > 0) {
          breakup.push({
            componentCode: comp.code,
            componentId: comp.id,
            calculationMethod: sc.calculationMethod,
            value: sc.value,
            monthlyAmount: Math.round(annualAmount / 12),
            annualAmount,
          });
        }
      }

      // If basic wasn't computed, estimate it
      if (basicAnnual === 0) basicAnnual = Math.round(annualGross * 0.4);

      // Second pass: PERCENT_OF_BASIC and FIXED components
      let totalEarnings = breakup.reduce((sum, b) => sum + b.annualAmount, 0);

      for (const sc of structComponents) {
        const comp = componentById.get(sc.componentId);
        if (!comp) continue;
        // Skip already processed
        if (breakup.some((b) => b.componentId === comp.id)) continue;

        let annualAmount = 0;

        if (sc.calculationMethod === 'PERCENT_OF_BASIC') {
          annualAmount = Math.round((basicAnnual * sc.value) / 100);
        } else if (sc.calculationMethod === 'FIXED') {
          if (comp.type === 'EARNING') {
            // For SPAL (Special Allowance): use as balancing component
            if (comp.code === 'SPAL') continue; // compute after all others
            // Fixed earnings (CONV, MED): use a reasonable fixed amount
            annualAmount = comp.code === 'CONV' ? 19200 : comp.code === 'MED' ? 15000 : 12000;
          } else if (comp.type === 'DEDUCTION' && comp.code === 'PT') {
            annualAmount = 2400; // ~200/month
          } else {
            continue; // skip employer contributions in fixed
          }
        } else if (sc.calculationMethod === 'FORMULA') {
          continue; // TDS is runtime
        }

        if (annualAmount > 0) {
          breakup.push({
            componentCode: comp.code,
            componentId: comp.id,
            calculationMethod: sc.calculationMethod,
            value: sc.value,
            monthlyAmount: Math.round(annualAmount / 12),
            annualAmount,
          });

          if (comp.type === 'EARNING') totalEarnings += annualAmount;
        }
      }

      // Special Allowance as balancing component (Gross - all other earnings)
      const spalComp = structComponents.find((sc) => {
        const comp = componentById.get(sc.componentId);
        return comp?.code === 'SPAL';
      });
      if (spalComp) {
        const spalAmount = Math.max(0, annualGross - totalEarnings);
        const comp = componentById.get(spalComp.componentId)!;
        breakup.push({
          componentCode: 'SPAL',
          componentId: comp.id,
          calculationMethod: 'FIXED',
          value: spalAmount,
          monthlyAmount: Math.round(spalAmount / 12),
          annualAmount: spalAmount,
        });
      }

      // Create EmployeeSalary record
      await prisma.employeeSalary.create({
        data: {
          companyId,
          employeeId,
          structureId: structure.id,
          annualCtc,
          monthlyGross,
          components: breakup,
          effectiveFrom: new Date(emp.joiningDate),
          isCurrent: true,
        },
      });

      created++;
      vlog(ctx, MODULE, `Salary assigned: ${emp.employeeId} — CTC ${annualCtc}, Structure ${structure.code}`);
    }

    log(MODULE, `Created ${created} employee salary records`);
  },
};
