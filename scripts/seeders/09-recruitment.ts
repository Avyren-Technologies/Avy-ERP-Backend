import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  pickRandomN,
  randomInt,
  randomDecimal,
  randomDate,
  randomPastDate,
  randomPhone,
  generateName,
  generateEmail,
  weightedPick,
  QUALIFICATIONS,
  UNIVERSITIES,
} from './utils';

// ── Static Data ──

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
  'We are looking for a talented professional to join our growing team. The ideal candidate will have strong domain expertise and a passion for building scalable solutions.',
  'Exciting opportunity for an experienced candidate to drive impact across multiple product lines. You will work closely with cross-functional teams.',
  'Join our team and help build the next generation of enterprise solutions. Strong problem-solving skills and a collaborative mindset are key.',
  'Looking for a self-motivated individual with strong domain expertise. This role involves both strategic thinking and hands-on execution.',
];

const JOB_REQUIREMENTS = [
  '3+ years of relevant experience. Strong analytical and communication skills. Proficiency in relevant tools and technologies.',
  '5+ years in a similar role. Leadership experience preferred. Experience with agile methodologies.',
  'Bachelor\'s degree in relevant field. 2-4 years of professional experience. Team player with excellent communication skills.',
  'MBA or equivalent preferred. 4-6 years of experience. Strong stakeholder management abilities.',
];

const SOURCES = ['LinkedIn', 'Naukri', 'Referral', 'Walk-in', 'Campus', 'Indeed', 'Company Website', 'Instahyre'];

const INTERVIEW_ROUNDS = ['HR_ROUND', 'TECHNICAL', 'ASSESSMENT', 'FINAL'];

const INTERVIEW_FEEDBACK = [
  'Good technical skills, recommended for next round.',
  'Average performance, needs improvement in problem solving.',
  'Excellent communication and domain knowledge.',
  'Strong analytical skills, culture fit is good.',
  'Demonstrated solid understanding of fundamentals. Ready for next stage.',
  'Good potential but lacks experience in specific area.',
  'Outstanding problem-solving abilities. Strong hire recommendation.',
  'Adequate technical depth but communication could be improved.',
];

const EVALUATION_DIMENSIONS = [
  'Technical Skills',
  'Problem Solving',
  'Communication',
  'Culture Fit',
  'Leadership Potential',
  'Domain Knowledge',
];

const EVALUATION_COMMENTS: Record<string, string[]> = {
  'Technical Skills': [
    'Strong coding abilities demonstrated during live problem.',
    'Adequate knowledge but struggled with advanced concepts.',
    'Excellent system design understanding.',
  ],
  'Problem Solving': [
    'Methodical approach to breaking down problems.',
    'Creative solutions but needs more structured thinking.',
    'Quick to identify edge cases and optimal approaches.',
  ],
  'Communication': [
    'Articulate and clear in explaining thought process.',
    'Good listener, asks clarifying questions.',
    'Could improve on conciseness of explanations.',
  ],
  'Culture Fit': [
    'Aligns well with company values and work style.',
    'Collaborative mindset, team-oriented.',
    'Independent worker, may need to adapt to team dynamics.',
  ],
  'Leadership Potential': [
    'Shows initiative and ownership mentality.',
    'Has managed small teams effectively.',
    'Needs more experience before leadership roles.',
  ],
  'Domain Knowledge': [
    'Deep understanding of industry practices.',
    'Good foundational knowledge, room to grow.',
    'Extensive experience in the domain.',
  ],
};

const COMPANIES_PAST = [
  'Infosys', 'TCS', 'Wipro', 'HCL Technologies', 'Tech Mahindra',
  'Cognizant', 'Accenture', 'Capgemini', 'Mindtree', 'Mphasis',
  'Zomato', 'Swiggy', 'Flipkart', 'Razorpay', 'CRED',
  'PhonePe', 'Paytm', 'Ola', 'BigBasket', 'Freshworks',
];

const DESIGNATIONS_PAST = [
  'Software Engineer', 'Senior Developer', 'Associate Consultant', 'Analyst',
  'Team Lead', 'Project Manager', 'Technical Architect', 'Business Analyst',
  'Quality Engineer', 'Product Analyst', 'HR Executive', 'Operations Manager',
];

const DOCUMENT_TYPES = ['RESUME', 'COVER_LETTER', 'ID_PROOF', 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER', 'SALARY_SLIP'];

const REJECTION_REASONS = [
  'Does not meet minimum experience requirements.',
  'Better candidates available for this role.',
  'Technical skills gap in core areas.',
  'Salary expectations beyond budget.',
  'Culture fit concerns raised by panel.',
  'Candidate withdrew from process.',
];

const STAGE_TRANSITION_NOTES = [
  'Moved to next round based on strong performance.',
  'Panel recommends advancement.',
  'HR screening cleared.',
  'Technical assessment passed with good score.',
  'Final round approved by hiring manager.',
  'Offer extended based on panel consensus.',
];

// ── Seeder ──

const seed = async (ctx: SeedContext): Promise<void> => {
  // ── 1. Create 6 JobRequisitions ──
  const statuses: { status: string; title: string; empType: string; priority: string }[] = [
    { status: 'OPEN', title: JOB_TITLES[0], empType: 'FULL_TIME', priority: 'HIGH' },
    { status: 'OPEN', title: JOB_TITLES[4], empType: 'FULL_TIME', priority: 'URGENT' },
    { status: 'INTERVIEWING', title: JOB_TITLES[1], empType: 'FULL_TIME', priority: 'MEDIUM' },
    { status: 'INTERVIEWING', title: JOB_TITLES[5], empType: 'CONTRACT', priority: 'MEDIUM' },
    { status: 'FILLED', title: JOB_TITLES[2], empType: 'FULL_TIME', priority: 'LOW' },
    { status: 'CANCELLED', title: JOB_TITLES[3], empType: 'INTERNSHIP', priority: 'LOW' },
  ];

  const requisitions: { id: string; status: string; title: string }[] = [];

  for (const { status, title, empType, priority } of statuses) {
    const deptId = ctx.departmentIds.length > 0 ? pickRandom(ctx.departmentIds) : undefined;
    const desigId = ctx.designationIds.length > 0 ? pickRandom(ctx.designationIds) : undefined;

    try {
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
          sourceChannels: pickRandomN(SOURCES, randomInt(2, 4)),
          status: status as any,
          employmentType: empType as any,
          priority: priority as any,
          location: pickRandom(['Bangalore', 'Mumbai', 'Pune', 'Hyderabad', 'Remote']),
          requirements: pickRandom(JOB_REQUIREMENTS),
          experienceMin: randomInt(1, 4),
          experienceMax: randomInt(5, 12),
          companyId: ctx.companyId,
        },
      });
      requisitions.push({ id: req.id, status, title });
    } catch {
      // Skip duplicates
    }
  }
  vlog(ctx, 'recruitment', `Created ${requisitions.length} job requisitions`);

  // ── 2. Create 20 Candidates across requisitions ──
  const activeReqs = requisitions.filter((r) => r.status !== 'CANCELLED');
  const candidates: { id: string; stage: string; reqId: string; name: string }[] = [];

  const stagesByReqStatus: Record<string, { value: string; weight: number }[]> = {
    OPEN: [
      { value: 'APPLIED', weight: 30 },
      { value: 'SHORTLISTED', weight: 30 },
      { value: 'HR_ROUND', weight: 20 },
      { value: 'REJECTED', weight: 20 },
    ],
    INTERVIEWING: [
      { value: 'SHORTLISTED', weight: 10 },
      { value: 'HR_ROUND', weight: 15 },
      { value: 'TECHNICAL', weight: 25 },
      { value: 'FINAL', weight: 20 },
      { value: 'ASSESSMENT', weight: 15 },
      { value: 'ON_HOLD', weight: 5 },
      { value: 'REJECTED', weight: 10 },
    ],
    FILLED: [
      { value: 'HIRED', weight: 30 },
      { value: 'OFFER_SENT', weight: 20 },
      { value: 'REJECTED', weight: 30 },
      { value: 'ON_HOLD', weight: 20 },
    ],
  };

  for (let i = 0; i < 20; i++) {
    const req = activeReqs[i % activeReqs.length];
    const gender = Math.random() > 0.5 ? 'MALE' as const : 'FEMALE' as const;
    const { firstName, lastName } = generateName(gender);
    const stageWeights = stagesByReqStatus[req.status] || [{ value: 'APPLIED', weight: 100 }];
    const stage = weightedPick(stageWeights);
    const candidateName = `${firstName} ${lastName}`;

    try {
      const candidate = await ctx.prisma.candidate.create({
        data: {
          requisitionId: req.id,
          name: candidateName,
          email: generateEmail(firstName, lastName, pickRandom(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'])),
          phone: randomPhone(),
          source: pickRandom(SOURCES),
          currentCtc: randomInt(300000, 1500000),
          expectedCtc: randomInt(500000, 2000000),
          stage: stage as any,
          rating: randomDecimal(2.0, 5.0, 1),
          notes: `Candidate sourced via ${pickRandom(SOURCES)}. ${pickRandom([
            'Strong technical background.',
            'Good communication skills.',
            'Relevant domain experience.',
            'Leadership qualities observed.',
            'Quick learner with diverse experience.',
          ])}`,
          companyId: ctx.companyId,
        },
      });
      candidates.push({ id: candidate.id, stage, reqId: req.id, name: candidateName });
    } catch {
      // Skip duplicates
    }
  }
  vlog(ctx, 'recruitment', `Created ${candidates.length} candidates`);

  // ── 3. Create Candidate Education ──
  let educationCount = 0;
  for (const candidate of candidates) {
    const numEducation = randomInt(1, 3);
    const years = [randomInt(2012, 2020), randomInt(2008, 2016), randomInt(2005, 2012)];

    for (let i = 0; i < numEducation; i++) {
      try {
        await ctx.prisma.candidateEducation.create({
          data: {
            candidateId: candidate.id,
            qualification: QUALIFICATIONS[i % QUALIFICATIONS.length],
            degree: pickRandom(['Bachelor of Technology', 'Master of Business Administration', 'Bachelor of Commerce', 'Master of Technology', 'Bachelor of Science']),
            institution: pickRandom(['IIT Bombay', 'NIT Surathkal', 'BITS Pilani', 'Christ University', 'Manipal Institute', 'SRM University', 'VIT Vellore', 'RVCE Bangalore']),
            university: UNIVERSITIES[i % UNIVERSITIES.length],
            yearOfPassing: years[i],
            percentage: randomDecimal(60, 95, 1),
            companyId: ctx.companyId,
          },
        });
        educationCount++;
      } catch {
        // Skip
      }
    }
  }
  vlog(ctx, 'recruitment', `Created ${educationCount} education records`);

  // ── 4. Create Candidate Experience ──
  let experienceCount = 0;
  for (const candidate of candidates) {
    const numExperience = randomInt(1, 3);
    let lastEndYear = new Date().getFullYear();

    for (let i = 0; i < numExperience; i++) {
      const endYear = lastEndYear - (i === 0 ? 0 : randomInt(0, 1));
      const startYear = endYear - randomInt(1, 4);
      const isCurrentlyWorking = i === 0 && Math.random() > 0.4;
      lastEndYear = startYear;

      try {
        await ctx.prisma.candidateExperience.create({
          data: {
            candidateId: candidate.id,
            companyName: pickRandom(COMPANIES_PAST),
            designation: pickRandom(DESIGNATIONS_PAST),
            fromDate: new Date(`${startYear}-${String(randomInt(1, 12)).padStart(2, '0')}-01`),
            toDate: isCurrentlyWorking ? undefined : new Date(`${endYear}-${String(randomInt(1, 12)).padStart(2, '0')}-28`),
            currentlyWorking: isCurrentlyWorking,
            ctc: randomInt(300000, 1500000),
            description: pickRandom([
              'Developed and maintained enterprise applications.',
              'Led a team of 5 members for product development.',
              'Managed client relationships and project delivery.',
              'Responsible for testing and quality assurance.',
              'Handled data analytics and reporting.',
              'Core team member for platform engineering.',
            ]),
            companyId: ctx.companyId,
          },
        });
        experienceCount++;
      } catch {
        // Skip
      }
    }
  }
  vlog(ctx, 'recruitment', `Created ${experienceCount} experience records`);

  // ── 5. Create Candidate Documents ──
  let docCount = 0;
  for (const candidate of candidates) {
    // All candidates have a resume
    try {
      await ctx.prisma.candidateDocument.create({
        data: {
          candidateId: candidate.id,
          documentType: 'RESUME',
          fileName: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
          fileUrl: `https://storage.avyerp.com/recruitment/${candidate.id}/resume.pdf`,
          companyId: ctx.companyId,
        },
      });
      docCount++;
    } catch { /* skip */ }

    // Shortlisted+ candidates have more documents
    const advancedStages = ['SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED'];
    if (advancedStages.includes(candidate.stage)) {
      const extraDocs = pickRandomN(
        ['COVER_LETTER', 'ID_PROOF', 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER', 'SALARY_SLIP'],
        randomInt(1, 3),
      );
      for (const docType of extraDocs) {
        try {
          await ctx.prisma.candidateDocument.create({
            data: {
              candidateId: candidate.id,
              documentType: docType,
              fileName: `${candidate.name.replace(/\s+/g, '_')}_${docType.toLowerCase()}.pdf`,
              fileUrl: `https://storage.avyerp.com/recruitment/${candidate.id}/${docType.toLowerCase()}.pdf`,
              companyId: ctx.companyId,
            },
          });
          docCount++;
        } catch { /* skip */ }
      }
    }
  }
  vlog(ctx, 'recruitment', `Created ${docCount} documents`);

  // ── 6. Create Interviews + Interview Evaluations ──
  let totalInterviews = 0;
  let totalEvaluations = 0;
  const interviewStages = ['SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED'];

  for (const candidate of candidates) {
    if (!interviewStages.includes(candidate.stage)) continue;

    const numRounds = candidate.stage === 'HIRED' || candidate.stage === 'OFFER_SENT'
      ? randomInt(3, 4)
      : candidate.stage === 'FINAL' || candidate.stage === 'ASSESSMENT'
        ? randomInt(2, 3)
        : randomInt(1, 2);

    for (let r = 0; r < numRounds; r++) {
      const round = INTERVIEW_ROUNDS[r % INTERVIEW_ROUNDS.length];
      const scheduledDate = new Date(randomPastDate(ctx.months));
      scheduledDate.setHours(randomInt(9, 17), 0, 0, 0);

      const interviewStatus = (candidate.stage === 'HIRED' || candidate.stage === 'OFFER_SENT' || r < numRounds - 1)
        ? 'COMPLETED'
        : weightedPick([
            { value: 'COMPLETED', weight: 60 },
            { value: 'SCHEDULED', weight: 25 },
            { value: 'NO_SHOW', weight: 10 },
            { value: 'CANCELLED', weight: 5 },
          ]);

      try {
        const panelists = ctx.managerIds.length > 0
          ? pickRandomN(ctx.managerIds, randomInt(1, 3))
          : [];

        const interview = await ctx.prisma.interview.create({
          data: {
            candidateId: candidate.id,
            round,
            panelists,
            scheduledAt: scheduledDate,
            duration: pickRandom([30, 45, 60, 90]),
            meetingLink: Math.random() > 0.3 ? `https://meet.avyerp.com/interview-${randomInt(10000, 99999)}` : undefined,
            feedbackRating: interviewStatus === 'COMPLETED' ? randomDecimal(2.0, 5.0, 1) : undefined,
            feedbackNotes: interviewStatus === 'COMPLETED' ? pickRandom(INTERVIEW_FEEDBACK) : undefined,
            status: interviewStatus as any,
            companyId: ctx.companyId,
          },
        });
        totalInterviews++;

        // Create Interview Evaluations for completed interviews
        if (interviewStatus === 'COMPLETED' && panelists.length > 0) {
          // Each panelist submits 2-3 dimension evaluations
          for (const panelistId of panelists.slice(0, 2)) {
            const dimensions = pickRandomN(EVALUATION_DIMENSIONS, randomInt(2, 4));
            for (const dimension of dimensions) {
              const rating = randomInt(1, 5);
              const recommendation = rating >= 4
                ? weightedPick([{ value: 'STRONG_HIRE', weight: 40 }, { value: 'HIRE', weight: 60 }])
                : rating >= 3
                  ? weightedPick([{ value: 'HIRE', weight: 30 }, { value: 'MAYBE', weight: 70 }])
                  : weightedPick([{ value: 'NO_HIRE', weight: 60 }, { value: 'STRONG_NO_HIRE', weight: 40 }]);

              try {
                await ctx.prisma.interviewEvaluation.create({
                  data: {
                    interviewId: interview.id,
                    evaluatorId: panelistId,
                    dimension,
                    rating,
                    comments: pickRandom(EVALUATION_COMMENTS[dimension] || ['Good performance overall.']),
                    recommendation: recommendation as any,
                    companyId: ctx.companyId,
                  },
                });
                totalEvaluations++;
              } catch {
                // Skip
              }
            }
          }
        }
      } catch {
        // Skip duplicates
      }
    }
  }
  vlog(ctx, 'recruitment', `Created ${totalInterviews} interviews and ${totalEvaluations} evaluations`);

  // ── 7. Create Candidate Offers ──
  let offerCount = 0;
  const offerCandidates = candidates.filter(c => c.stage === 'OFFER_SENT' || c.stage === 'HIRED');

  for (const candidate of offerCandidates) {
    const deptId = ctx.departmentIds.length > 0 ? pickRandom(ctx.departmentIds) : undefined;
    const desigId = ctx.designationIds.length > 0 ? pickRandom(ctx.designationIds) : undefined;
    const offeredCtc = randomInt(500000, 2000000);

    const offerStatus = candidate.stage === 'HIRED'
      ? 'ACCEPTED'
      : weightedPick([
          { value: 'SENT', weight: 50 },
          { value: 'ACCEPTED', weight: 20 },
          { value: 'REJECTED', weight: 20 },
          { value: 'EXPIRED', weight: 10 },
        ]);

    const joiningDate = new Date();
    joiningDate.setDate(joiningDate.getDate() + randomInt(15, 60));

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + randomInt(7, 15));

    try {
      await ctx.prisma.candidateOffer.create({
        data: {
          candidateId: candidate.id,
          designationId: desigId ?? undefined,
          departmentId: deptId ?? undefined,
          offeredCtc,
          ctcBreakup: {
            basic: Math.round(offeredCtc * 0.4),
            hra: Math.round(offeredCtc * 0.2),
            specialAllowance: Math.round(offeredCtc * 0.15),
            pf: Math.round(offeredCtc * 0.12),
            gratuity: Math.round(offeredCtc * 0.048),
            insurance: Math.round(offeredCtc * 0.03),
            variable: Math.round(offeredCtc * 0.052),
          },
          joiningDate,
          validUntil,
          offerLetterUrl: `https://storage.avyerp.com/recruitment/${candidate.id}/offer-letter.pdf`,
          status: offerStatus as any,
          acceptedAt: offerStatus === 'ACCEPTED' ? new Date(randomPastDate(1)) : undefined,
          rejectedAt: offerStatus === 'REJECTED' ? new Date(randomPastDate(1)) : undefined,
          rejectionReason: offerStatus === 'REJECTED' ? pickRandom(['Accepted another offer', 'Salary not competitive', 'Personal reasons', 'Counter-offer from current employer']) : undefined,
          notes: pickRandom([
            'Offer as per approved budget.',
            'Compensation aligned with band for this grade.',
            'Variable component linked to quarterly targets.',
            null,
          ]) ?? undefined,
          companyId: ctx.companyId,
        },
      });
      offerCount++;
    } catch {
      // Skip
    }
  }
  vlog(ctx, 'recruitment', `Created ${offerCount} offers`);

  // ── 8. Create Candidate Stage History ──
  let historyCount = 0;

  const stageOrder: string[] = ['APPLIED', 'SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED'];

  for (const candidate of candidates) {
    const currentStageIdx = stageOrder.indexOf(candidate.stage);
    if (currentStageIdx < 0) {
      // For REJECTED/ON_HOLD, create a partial history
      const numStages = randomInt(1, 3);
      let prevStage = 'APPLIED';
      for (let i = 0; i < numStages && i < stageOrder.length - 1; i++) {
        const toStage = i === numStages - 1 ? candidate.stage : stageOrder[i + 1];
        try {
          const changedAt = new Date(randomPastDate(ctx.months));
          changedAt.setDate(changedAt.getDate() + i * randomInt(2, 7));
          await ctx.prisma.candidateStageHistory.create({
            data: {
              candidateId: candidate.id,
              fromStage: prevStage as any,
              toStage: toStage as any,
              reason: toStage === 'REJECTED' ? pickRandom(REJECTION_REASONS) : undefined,
              notes: toStage === 'REJECTED' ? undefined : pickRandom(STAGE_TRANSITION_NOTES),
              changedBy: ctx.managerIds.length > 0 ? pickRandom(ctx.managerIds) : ctx.employeeIds[0],
              changedAt,
              companyId: ctx.companyId,
            },
          });
          historyCount++;
          prevStage = toStage;
        } catch { /* skip */ }
      }
    } else {
      // Create full stage history up to current stage
      for (let i = 0; i < currentStageIdx; i++) {
        try {
          const changedAt = new Date(randomPastDate(ctx.months));
          changedAt.setDate(changedAt.getDate() + i * randomInt(2, 7));
          await ctx.prisma.candidateStageHistory.create({
            data: {
              candidateId: candidate.id,
              fromStage: stageOrder[i] as any,
              toStage: stageOrder[i + 1] as any,
              notes: pickRandom(STAGE_TRANSITION_NOTES),
              changedBy: ctx.managerIds.length > 0 ? pickRandom(ctx.managerIds) : ctx.employeeIds[0],
              changedAt,
              companyId: ctx.companyId,
            },
          });
          historyCount++;
        } catch { /* skip */ }
      }
    }
  }
  vlog(ctx, 'recruitment', `Created ${historyCount} stage history records`);

  // ── Summary ──
  log('recruitment', `Seeded: ${requisitions.length} requisitions, ${candidates.length} candidates, ${totalInterviews} interviews, ${totalEvaluations} evaluations, ${offerCount} offers, ${educationCount} education, ${experienceCount} experience, ${docCount} documents, ${historyCount} stage history`);
};

const module: SeederModule = {
  name: 'recruitment',
  order: 9,
  seed,
};

export default module;
