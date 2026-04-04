import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  pickRandomN,
  randomInt,
  randomDecimal,
  randomPastDate,
} from './utils';

const TRAINING_CATALOGUE_DATA = [
  {
    name: 'Advanced React & TypeScript',
    type: 'TECHNICAL',
    mode: 'ONLINE' as const,
    duration: '16 hours',
    mandatory: false,
    vendorProvider: 'Udemy Business',
    costPerHead: 5000,
    certificationName: 'React Advanced Certification',
  },
  {
    name: 'POSH Awareness Training',
    type: 'COMPLIANCE',
    mode: 'CLASSROOM' as const,
    duration: '4 hours',
    mandatory: true,
    vendorProvider: 'Internal HR',
    costPerHead: 0,
    certificationName: null,
  },
  {
    name: 'Effective Communication & Presentation',
    type: 'SOFT_SKILLS',
    mode: 'WORKSHOP' as const,
    duration: '8 hours',
    mandatory: false,
    vendorProvider: 'Dale Carnegie',
    costPerHead: 15000,
    certificationName: null,
  },
  {
    name: 'AWS Solutions Architect',
    type: 'TECHNICAL',
    mode: 'EXTERNAL' as const,
    duration: '5 days',
    mandatory: false,
    vendorProvider: 'AWS Training',
    costPerHead: 35000,
    certificationName: 'AWS SAA-C03',
    certificationBody: 'Amazon Web Services',
    certificationValidity: 3,
  },
  {
    name: 'First Aid & Fire Safety',
    type: 'COMPLIANCE',
    mode: 'CLASSROOM' as const,
    duration: '4 hours',
    mandatory: true,
    vendorProvider: 'Internal Safety Team',
    costPerHead: 0,
    certificationName: null,
  },
  {
    name: 'Leadership Development Program',
    type: 'SOFT_SKILLS',
    mode: 'BLENDED' as const,
    duration: '3 days',
    mandatory: false,
    vendorProvider: 'XLRI Executive Education',
    costPerHead: 50000,
    certificationName: 'Leadership Excellence',
    certificationBody: 'XLRI',
    certificationValidity: 5,
  },
];

const seed = async (ctx: SeedContext): Promise<void> => {
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );

  // ── 1. Create 6 TrainingCatalogue entries ──
  const catalogues: { id: string; name: string }[] = [];

  for (const data of TRAINING_CATALOGUE_DATA) {
    try {
      const catalogue = await ctx.prisma.trainingCatalogue.create({
        data: {
          name: data.name,
          type: data.type,
          mode: data.mode,
          duration: data.duration,
          mandatory: data.mandatory,
          vendorProvider: data.vendorProvider,
          costPerHead: data.costPerHead,
          certificationName: data.certificationName ?? undefined,
          certificationBody: (data as any).certificationBody ?? undefined,
          certificationValidity: (data as any).certificationValidity ?? undefined,
          proficiencyGain: randomInt(1, 2),
          isActive: true,
          companyId: ctx.companyId,
        },
      });
      catalogues.push({ id: catalogue.id, name: catalogue.name });
    } catch {
      // Skip if already exists
      const existing = await ctx.prisma.trainingCatalogue.findFirst({
        where: { companyId: ctx.companyId, name: data.name },
      });
      if (existing) catalogues.push({ id: existing.id, name: existing.name });
    }
  }
  vlog(ctx, 'training', `Created/found ${catalogues.length} training catalogue entries`);

  // ── 2. Create 15 TrainingNominations ──
  const nominationStatuses: { value: string; weight: number }[] = [
    { value: 'COMPLETED', weight: 40 },
    { value: 'ENROLLED', weight: 25 },
    { value: 'NOMINATED', weight: 25 },
    { value: 'CANCELLED', weight: 10 },
  ];

  let nominationCount = 0;
  const selectedEmployees = pickRandomN(activeEmployees, Math.min(activeEmployees.length, 15));

  for (let i = 0; i < 15 && catalogues.length > 0; i++) {
    const emp = selectedEmployees[i % selectedEmployees.length];
    const catalogue = pickRandom(catalogues);

    const status = pickRandom(nominationStatuses.flatMap((s) =>
      Array(s.weight).fill(s.value),
    ));

    try {
      await ctx.prisma.trainingNomination.create({
        data: {
          employeeId: emp.id,
          trainingId: catalogue.id,
          status: status as any,
          completionDate: status === 'COMPLETED' ? new Date(randomPastDate(ctx.months)) : undefined,
          score: status === 'COMPLETED' ? randomDecimal(60, 100, 2) : undefined,
          companyId: ctx.companyId,
        },
      });
      nominationCount++;
    } catch {
      // Skip duplicates or constraint violations
    }
  }

  log('training', `Created ${catalogues.length} training catalogues and ${nominationCount} nominations`);
};

const module: SeederModule = {
  name: 'training',
  order: 10,
  seed,
};

export default module;
