import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate } from './utils';

const MODULE = 'grievances';

const GRIEVANCE_DESCRIPTIONS = [
  'Unfair workload distribution among team members',
  'Harassment by a colleague during team meetings',
  'Manager showing favoritism in project assignments',
  'Delay in salary processing for the last two months',
  'Unsafe working conditions in the warehouse area',
  'Denied leave request without valid justification',
  'Discriminatory remarks during performance review',
  'Lack of proper equipment to perform duties',
];

const DISCIPLINARY_CHARGES = [
  'Repeated unauthorized absences over the last month',
  'Violation of company data privacy policy',
  'Insubordination and refusal to follow manager directives',
];

export const seeder: SeederModule = {
  name: 'Grievances',
  order: 15,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap } = ctx;

    // Check existing grievance categories
    const categories = await prisma.grievanceCategory.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    if (categories.length === 0) {
      log(MODULE, 'No grievance categories found — skipping');
      return;
    }

    // Check existing cases
    const existingCases = await prisma.grievanceCase.count({ where: { companyId } });
    if (existingCases >= 3) {
      log(MODULE, `Skipping — ${existingCases} grievance cases already exist`);
      return;
    }

    const statuses: { status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED'; resolution?: string }[] = [
      { status: 'OPEN' },
      { status: 'INVESTIGATING' },
      { status: 'RESOLVED', resolution: 'Issue addressed through mediation and team restructuring.' },
      { status: 'CLOSED', resolution: 'Resolved after investigation — policy clarification issued to all teams.' },
      { status: 'RESOLVED', resolution: 'Corrective action taken. Employee counseled and reassigned.' },
    ];

    const caseEmployees = pickRandomN(employeeIds, 5);
    let casesCreated = 0;

    for (let i = 0; i < statuses.length; i++) {
      const employeeId = caseEmployees[i % caseEmployees.length];
      const category = pickRandom(categories);
      const statusDef = statuses[i];
      const isAnonymous = i === 1; // Make one anonymous

      await prisma.grievanceCase.create({
        data: {
          companyId,
          employeeId: isAnonymous ? undefined : employeeId,
          categoryId: category.id,
          description: GRIEVANCE_DESCRIPTIONS[i % GRIEVANCE_DESCRIPTIONS.length],
          isAnonymous,
          status: statusDef.status,
          resolution: statusDef.resolution || undefined,
          resolvedBy:
            statusDef.status === 'RESOLVED' || statusDef.status === 'CLOSED' ? 'system-seed' : undefined,
          resolvedAt:
            statusDef.status === 'RESOLVED' || statusDef.status === 'CLOSED'
              ? new Date(randomPastDate(1))
              : undefined,
        },
      });

      casesCreated++;
      vlog(ctx, MODULE, `Created grievance case: ${statusDef.status} (${category.name})`);
    }

    // Create 2-3 disciplinary actions
    const disciplinaryEmployees = pickRandomN(employeeIds, 3);
    const actionTypes: ('VERBAL_WARNING' | 'WRITTEN_WARNING' | 'PIP')[] = [
      'VERBAL_WARNING',
      'WRITTEN_WARNING',
      'PIP',
    ];
    let actionsCreated = 0;

    for (let i = 0; i < 3; i++) {
      const employeeId = disciplinaryEmployees[i];
      const type = actionTypes[i];

      await prisma.disciplinaryAction.create({
        data: {
          companyId,
          employeeId,
          type,
          charges: DISCIPLINARY_CHARGES[i],
          replyDueBy: type === 'WRITTEN_WARNING' ? new Date(randomPastDate(-1)) : undefined,
          replyReceived: type === 'VERBAL_WARNING' ? 'Acknowledged and committed to improvement.' : undefined,
          pipDuration: type === 'PIP' ? 90 : undefined,
          pipOutcome: type === 'PIP' ? 'SUCCESS' : undefined,
          status: type === 'VERBAL_WARNING' ? 'RESOLVED' : type === 'PIP' ? 'PIP_ACTIVE' : 'ISSUED',
          issuedBy: 'system-seed',
        },
      });

      actionsCreated++;
      vlog(ctx, MODULE, `Created disciplinary action: ${type}`);
    }

    log(MODULE, `Created ${casesCreated} grievance cases, ${actionsCreated} disciplinary actions`);
  },
};
