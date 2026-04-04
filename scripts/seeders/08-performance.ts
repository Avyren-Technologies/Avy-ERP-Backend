import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  pickRandomN,
  randomInt,
  randomDecimal,
} from './utils';

const GOAL_TITLES: Record<string, string[]> = {
  COMPANY: [
    'Increase revenue by 20% YoY',
    'Improve customer satisfaction score to 4.5+',
    'Launch 3 new product features',
    'Reduce operational costs by 10%',
    'Expand to 2 new markets',
  ],
  DEPARTMENT: [
    'Reduce team attrition below 10%',
    'Complete department automation initiative',
    'Achieve 95% SLA compliance',
    'Upskill team on emerging technologies',
    'Improve interdepartmental collaboration score',
  ],
  INDIVIDUAL: [
    'Complete assigned project milestones on time',
    'Improve code review turnaround time',
    'Mentor 2 junior team members',
    'Obtain professional certification',
    'Deliver monthly status reports on schedule',
    'Achieve 90%+ quality metrics',
    'Reduce bug count in deliverables',
    'Present at 1 internal tech talk',
    'Document all key processes',
    'Improve personal productivity by 15%',
  ],
};

const SKILL_ENTRIES = [
  { name: 'JavaScript/TypeScript', category: 'Technical' },
  { name: 'React/React Native', category: 'Technical' },
  { name: 'Node.js', category: 'Technical' },
  { name: 'SQL & Database Design', category: 'Technical' },
  { name: 'Cloud Infrastructure (AWS)', category: 'Technical' },
  { name: 'Communication', category: 'Soft Skills' },
  { name: 'Leadership', category: 'Soft Skills' },
  { name: 'Problem Solving', category: 'Soft Skills' },
  { name: 'Data Privacy & GDPR', category: 'Compliance' },
  { name: 'Project Management', category: 'Domain' },
];

const NINE_BOX = [
  'Top Talent', 'Future Star', 'Core Player', 'High Performer',
  'Solid Contributor', 'Needs Development', 'Under Performer',
];

const seed = async (ctx: SeedContext): Promise<void> => {
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );
  const currentYear = new Date().getFullYear();

  // ── 1. Create AppraisalCycle ──
  const cycle = await ctx.prisma.appraisalCycle.create({
    data: {
      name: `Annual Review FY ${currentYear - 1}-${String(currentYear).slice(2)}`,
      frequency: 'ANNUAL',
      startDate: new Date(`${currentYear - 1}-04-01`),
      endDate: new Date(`${currentYear}-03-31`),
      ratingScale: 5,
      ratingLabels: ['Poor', 'Below Expectations', 'Meets Expectations', 'Exceeds Expectations', 'Exceptional'],
      kraWeightage: 70,
      competencyWeightage: 30,
      status: 'ACTIVE',
      companyId: ctx.companyId,
    },
  });
  vlog(ctx, 'performance', `Created appraisal cycle: ${cycle.name}`);

  // ── 2. Create Goals (3-5 per employee) ──
  let goalCount = 0;
  for (const emp of activeEmployees) {
    const numGoals = randomInt(3, 5);
    const levels = ['INDIVIDUAL', 'INDIVIDUAL', 'INDIVIDUAL', 'DEPARTMENT', 'COMPANY'];
    const selectedLevels = levels.slice(0, numGoals);
    const totalWeightage = 100;
    const perGoalWeight = parseFloat((totalWeightage / numGoals).toFixed(2));

    for (let g = 0; g < numGoals; g++) {
      const level = selectedLevels[g];
      const titles = GOAL_TITLES[level] || GOAL_TITLES['INDIVIDUAL'];
      const status = pickRandom(['ACTIVE', 'ACTIVE', 'ACTIVE', 'COMPLETED'] as const);

      await ctx.prisma.goal.create({
        data: {
          cycleId: cycle.id,
          employeeId: emp.id,
          departmentId: level === 'DEPARTMENT' ? emp.departmentId : undefined,
          title: pickRandom(titles),
          description: `Goal for ${emp.firstName} ${emp.lastName}`,
          weightage: perGoalWeight,
          level,
          status: status as any,
          targetValue: randomInt(80, 100),
          achievedValue: status === 'COMPLETED' ? randomInt(70, 100) : randomInt(20, 70),
          selfRating: Math.random() > 0.3 ? randomInt(3, 5) : undefined,
          managerRating: Math.random() > 0.5 ? randomInt(2, 5) : undefined,
          companyId: ctx.companyId,
        },
      });
      goalCount++;
    }
  }
  vlog(ctx, 'performance', `Created ${goalCount} goals`);

  // ── 3. Create AppraisalEntry for each employee ──
  let entryCount = 0;
  for (const emp of activeEmployees) {
    const hasSelfReview = Math.random() > 0.1;
    const hasManagerReview = Math.random() > 0.5;

    let status: string;
    if (hasManagerReview) {
      status = pickRandom(['MANAGER_REVIEW', 'HR_REVIEW', 'PUBLISHED']);
    } else if (hasSelfReview) {
      status = 'SELF_REVIEW';
    } else {
      status = 'PENDING';
    }

    await ctx.prisma.appraisalEntry.create({
      data: {
        cycleId: cycle.id,
        employeeId: emp.id,
        selfRating: hasSelfReview ? randomDecimal(3.0, 5.0, 1) : undefined,
        managerRating: hasManagerReview ? randomDecimal(2.5, 5.0, 1) : undefined,
        finalRating: status === 'PUBLISHED' ? randomDecimal(2.5, 5.0, 1) : undefined,
        kraScore: hasSelfReview ? randomDecimal(50, 95, 2) : undefined,
        competencyScore: hasSelfReview ? randomDecimal(50, 95, 2) : undefined,
        selfComments: hasSelfReview ? 'I have met most of my targets and contributed to team goals.' : undefined,
        managerComments: hasManagerReview ? 'Good performance overall. Areas of improvement identified.' : undefined,
        promotionRecommended: hasManagerReview && Math.random() > 0.8,
        incrementPercent: hasManagerReview ? randomDecimal(5, 25, 2) : undefined,
        status: status as any,
        publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
        companyId: ctx.companyId,
      },
    });
    entryCount++;
  }
  vlog(ctx, 'performance', `Created ${entryCount} appraisal entries`);

  // ── 4. Create Feedback360 records (10-15) ──
  const feedbackCount = randomInt(10, 15);
  let createdFeedback = 0;
  const empArray = activeEmployees;

  for (let i = 0; i < feedbackCount && empArray.length >= 2; i++) {
    const subject = empArray[i % empArray.length];
    // Pick a different employee as rater
    const possibleRaters = empArray.filter((e) => e.id !== subject.id);
    if (possibleRaters.length === 0) continue;
    const rater = pickRandom(possibleRaters);
    const raterType = pickRandom(['PEER', 'MANAGER', 'SUBORDINATE', 'CROSS_FUNCTION'] as const);

    try {
      await ctx.prisma.feedback360.create({
        data: {
          cycleId: cycle.id,
          employeeId: subject.id,
          raterId: rater.id,
          raterType: raterType as any,
          ratings: {
            delivery: randomInt(2, 5),
            communication: randomInt(2, 5),
            teamwork: randomInt(2, 5),
            initiative: randomInt(2, 5),
          },
          strengths: 'Strong technical skills and team collaboration.',
          improvements: 'Could improve on time management and documentation.',
          wouldWorkAgain: Math.random() > 0.2,
          isAnonymous: Math.random() > 0.3,
          submittedAt: new Date(),
          companyId: ctx.companyId,
        },
      });
      createdFeedback++;
    } catch {
      // Skip unique constraint violations
    }
  }
  vlog(ctx, 'performance', `Created ${createdFeedback} feedback360 records`);

  // ── 5. Create SkillLibrary entries ──
  const skills: { id: string; name: string }[] = [];
  for (const entry of SKILL_ENTRIES) {
    try {
      const skill = await ctx.prisma.skillLibrary.create({
        data: {
          name: entry.name,
          category: entry.category,
          description: `${entry.category} skill: ${entry.name}`,
          companyId: ctx.companyId,
        },
      });
      skills.push({ id: skill.id, name: skill.name });
    } catch {
      // Unique constraint — fetch existing
      const existing = await ctx.prisma.skillLibrary.findFirst({
        where: { companyId: ctx.companyId, name: entry.name },
      });
      if (existing) skills.push({ id: existing.id, name: existing.name });
    }
  }
  vlog(ctx, 'performance', `Created/found ${skills.length} skill library entries`);

  // ── 6. Create SkillMapping for each employee (3-5 skills each) ──
  let mappingCount = 0;
  if (skills.length > 0) {
    for (const emp of activeEmployees) {
      const empSkills = pickRandomN(skills, randomInt(3, Math.min(5, skills.length)));
      for (const skill of empSkills) {
        try {
          await ctx.prisma.skillMapping.create({
            data: {
              employeeId: emp.id,
              skillId: skill.id,
              currentLevel: randomInt(1, 4),
              requiredLevel: randomInt(3, 5),
              assessedAt: new Date(),
              companyId: ctx.companyId,
            },
          });
          mappingCount++;
        } catch {
          // Skip duplicates
        }
      }
    }
  }
  vlog(ctx, 'performance', `Created ${mappingCount} skill mappings`);

  // ── 7. Create SuccessionPlan entries (2-3) ──
  const successionCount = randomInt(2, 3);
  const criticalRoles = [
    'Engineering Manager',
    'Head of Product',
    'VP of Operations',
    'Chief Technology Officer',
    'Director of Sales',
  ];
  let createdSuccession = 0;

  const successors = pickRandomN(activeEmployees, successionCount);
  for (let i = 0; i < successionCount && i < successors.length; i++) {
    const emp = successors[i];
    await ctx.prisma.successionPlan.create({
      data: {
        criticalRoleTitle: criticalRoles[i % criticalRoles.length],
        criticalRoleDesignationId: emp.designationId,
        successorId: emp.id,
        readiness: pickRandom(['READY_NOW', 'ONE_YEAR', 'TWO_YEARS', 'NOT_READY'] as const) as any,
        developmentPlan: 'Complete leadership program and cross-functional project experience.',
        performanceRating: randomDecimal(3.0, 5.0, 1),
        potentialRating: randomDecimal(3.0, 5.0, 1),
        nineBoxPosition: pickRandom(NINE_BOX),
        companyId: ctx.companyId,
      },
    });
    createdSuccession++;
  }

  log('performance', `Created 1 appraisal cycle, ${goalCount} goals, ${entryCount} entries, ${createdFeedback} feedback360, ${skills.length} skills, ${mappingCount} skill mappings, ${createdSuccession} succession plans`);
};

const module: SeederModule = {
  name: 'performance',
  order: 8,
  seed,
};

export default module;
