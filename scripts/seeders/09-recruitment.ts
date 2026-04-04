import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  randomInt,
  randomDecimal,
  generateName,
  generateEmail,
  randomPhone,
  randomPastDate,
} from './utils';

const JOB_TITLES = [
  'Senior Software Engineer',
  'Product Manager',
  'HR Business Partner',
  'Data Analyst',
  'DevOps Engineer',
  'UX Designer',
  'Business Development Executive',
  'Quality Assurance Lead',
];

const JOB_DESCRIPTIONS = [
  'We are looking for a talented professional to join our growing team.',
  'Exciting opportunity for an experienced candidate to drive impact.',
  'Join our team and help build the next generation of enterprise solutions.',
  'Looking for a self-motivated individual with strong domain expertise.',
];

const SOURCES = ['LinkedIn', 'Naukri', 'Referral', 'Walk-in', 'Campus', 'Indeed', 'Company Website'];

const INTERVIEW_ROUNDS = ['HR_ROUND', 'TECHNICAL', 'ASSESSMENT', 'FINAL'];

const seed = async (ctx: SeedContext): Promise<void> => {
  const statuses: { status: string; title: string }[] = [
    { status: 'OPEN', title: JOB_TITLES[0] },
    { status: 'INTERVIEWING', title: JOB_TITLES[1] },
    { status: 'FILLED', title: JOB_TITLES[2] },
    { status: 'CANCELLED', title: JOB_TITLES[3] },
  ];

  const requisitions: { id: string; status: string }[] = [];

  // ── 1. Create 4 JobRequisitions ──
  for (const { status, title } of statuses) {
    const deptId = ctx.departmentIds.length > 0 ? pickRandom(ctx.departmentIds) : undefined;
    const desigId = ctx.designationIds.length > 0 ? pickRandom(ctx.designationIds) : undefined;

    const req = await ctx.prisma.jobRequisition.create({
      data: {
        title,
        designationId: desigId ?? undefined,
        departmentId: deptId ?? undefined,
        openings: randomInt(1, 3),
        description: pickRandom(JOB_DESCRIPTIONS),
        budgetMin: randomInt(400000, 800000),
        budgetMax: randomInt(900000, 1800000),
        targetDate: new Date(randomPastDate(-3)), // future date
        sourceChannels: ['LinkedIn', 'Naukri', 'Referral'],
        status: status as any,
        companyId: ctx.companyId,
      },
    });
    requisitions.push({ id: req.id, status });
  }
  vlog(ctx, 'recruitment', `Created ${requisitions.length} job requisitions`);

  // ── 2. Create 15 Candidates across requisitions ──
  const activeReqs = requisitions.filter((r) => r.status !== 'CANCELLED');
  let totalCandidates = 0;
  let totalInterviews = 0;

  const stagesByReqStatus: Record<string, string[]> = {
    OPEN: ['APPLIED', 'SHORTLISTED', 'HR_ROUND'],
    INTERVIEWING: ['SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT'],
    FILLED: ['HIRED', 'REJECTED', 'OFFER_SENT'],
  };

  for (let i = 0; i < 15; i++) {
    const req = activeReqs[i % activeReqs.length];
    const gender = Math.random() > 0.5 ? 'MALE' as const : 'FEMALE' as const;
    const { firstName, lastName } = generateName(gender);
    const possibleStages = stagesByReqStatus[req.status] || ['APPLIED'];
    const stage = pickRandom(possibleStages);

    const candidate = await ctx.prisma.candidate.create({
      data: {
        requisitionId: req.id,
        name: `${firstName} ${lastName}`,
        email: generateEmail(firstName, lastName, 'gmail.com'),
        phone: randomPhone(),
        source: pickRandom(SOURCES),
        currentCtc: randomInt(300000, 1200000),
        expectedCtc: randomInt(500000, 1800000),
        stage: stage as any,
        rating: randomDecimal(2.0, 5.0, 1),
        notes: `Candidate sourced via ${pickRandom(SOURCES)}. ${Math.random() > 0.5 ? 'Strong technical background.' : 'Good communication skills.'}`,
        companyId: ctx.companyId,
      },
    });
    totalCandidates++;

    // ── 3. Create Interview records for shortlisted+ candidates ──
    const interviewStages = ['SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED'];
    if (interviewStages.includes(stage)) {
      const numRounds = stage === 'HIRED' || stage === 'OFFER_SENT' ? randomInt(2, 3) : randomInt(1, 2);
      for (let r = 0; r < numRounds; r++) {
        const round = INTERVIEW_ROUNDS[r % INTERVIEW_ROUNDS.length];
        const scheduledDate = new Date(randomPastDate(ctx.months));
        scheduledDate.setHours(randomInt(9, 17), 0, 0, 0);

        const interviewStatus = stage === 'HIRED' || stage === 'OFFER_SENT'
          ? 'COMPLETED'
          : pickRandom(['SCHEDULED', 'COMPLETED'] as const);

        await ctx.prisma.interview.create({
          data: {
            candidateId: candidate.id,
            round,
            panelists: ctx.managerIds.length > 0
              ? [pickRandom(ctx.managerIds)]
              : [],
            scheduledAt: scheduledDate,
            duration: pickRandom([30, 45, 60]),
            feedbackRating: interviewStatus === 'COMPLETED' ? randomDecimal(2.0, 5.0, 1) : undefined,
            feedbackNotes: interviewStatus === 'COMPLETED'
              ? pickRandom([
                  'Good technical skills, recommended for next round.',
                  'Average performance, needs improvement in problem solving.',
                  'Excellent communication and domain knowledge.',
                  'Strong analytical skills, culture fit is good.',
                ])
              : undefined,
            status: interviewStatus as any,
            companyId: ctx.companyId,
          },
        });
        totalInterviews++;
      }
    }
  }

  log('recruitment', `Created ${requisitions.length} requisitions, ${totalCandidates} candidates, ${totalInterviews} interviews`);
};

const module: SeederModule = {
  name: 'recruitment',
  order: 9,
  seed,
};

export default module;
