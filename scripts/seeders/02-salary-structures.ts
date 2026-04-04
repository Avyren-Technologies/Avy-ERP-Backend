import type { SeederModule } from './types';
import { log, vlog } from './types';

const MODULE = 'salary-structures';

interface StructureComponent {
  componentId: string;
  calculationMethod: string;
  value: number;
  formula?: string;
}

interface StructureDef {
  name: string;
  code: string;
  gradeIds: string[];
  components: StructureComponent[];
}

export const seeder: SeederModule = {
  name: 'Salary Structures',
  order: 2,
  seed: async (ctx) => {
    const { prisma, companyId } = ctx;

    // Check if structures already exist
    const existingCount = await prisma.salaryStructure.count({ where: { companyId } });
    if (existingCount > 0) {
      log(MODULE, `Skipping — ${existingCount} salary structures already exist`);
      // Populate ctx with existing IDs
      const existing = await prisma.salaryStructure.findMany({
        where: { companyId },
        select: { id: true },
      });
      ctx.salaryStructureIds = existing.map((s) => s.id);
      return;
    }

    // Look up salary component IDs by code
    const components = await prisma.salaryComponent.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, calculationMethod: true, formulaValue: true },
    });

    const componentByCode = new Map(components.map((c) => [c.code, c]));

    const getComponentId = (code: string): string => {
      const comp = componentByCode.get(code);
      if (!comp) throw new Error(`Salary component "${code}" not found for company ${companyId}`);
      return comp.id;
    };

    // Resolve grade IDs from gradeMap
    const gradeIdsByCode = new Map<string, string>();
    for (const [, grade] of ctx.gradeMap) {
      gradeIdsByCode.set(grade.code, grade.id);
    }

    // Build earning components for structures
    // BASIC (40% of Gross), HRA (50% of Basic), DA (10% of Basic), CONV (fixed), MED (fixed), SPAL (balancing)
    const earningCodes = ['BASIC', 'HRA', 'DA', 'CONV', 'MED', 'SPAL'];
    const deductionCodes = ['PF_EE', 'ESI_EE', 'PT'];
    const employerCodes = ['PF_ER', 'ESI_ER'];
    const allCodes = [...earningCodes, ...deductionCodes, ...employerCodes];

    const buildComponents = (): StructureComponent[] => {
      return allCodes
        .filter((code) => componentByCode.has(code))
        .map((code) => {
          const comp = componentByCode.get(code)!;
          return {
            componentId: comp.id,
            calculationMethod: comp.calculationMethod,
            value: comp.formulaValue ? Number(comp.formulaValue) : 0,
          };
        });
    };

    const structureComponents = buildComponents();

    const structures: StructureDef[] = [
      {
        name: 'Junior CTC Structure',
        code: 'STD-JR',
        gradeIds: [gradeIdsByCode.get('G1'), gradeIdsByCode.get('G2')].filter(Boolean) as string[],
        components: structureComponents,
      },
      {
        name: 'Mid-Level CTC Structure',
        code: 'STD-MID',
        gradeIds: [gradeIdsByCode.get('G3')].filter(Boolean) as string[],
        components: structureComponents,
      },
      {
        name: 'Senior CTC Structure',
        code: 'STD-SR',
        gradeIds: [gradeIdsByCode.get('G4'), gradeIdsByCode.get('G5')].filter(Boolean) as string[],
        components: structureComponents,
      },
    ];

    const createdIds: string[] = [];

    for (const def of structures) {
      const created = await prisma.salaryStructure.create({
        data: {
          companyId,
          name: def.name,
          code: def.code,
          applicableGradeIds: def.gradeIds,
          components: def.components,
          ctcBasis: 'CTC',
          isActive: true,
        },
      });
      createdIds.push(created.id);
      vlog(ctx, MODULE, `Created structure: ${def.name} (${def.code})`);
    }

    ctx.salaryStructureIds = createdIds;
    log(MODULE, `Created ${createdIds.length} salary structures (STD-JR, STD-MID, STD-SR)`);
  },
};
