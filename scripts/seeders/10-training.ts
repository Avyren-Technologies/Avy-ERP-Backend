import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  pickRandomN,
  randomInt,
  randomDecimal,
  randomPastDate,
  generateName,
  generateEmail,
  randomPhone,
  weightedPick,
  getPastMonths,
} from './utils';

// ── Static Data ──

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
    certificationBody: 'Udemy',
    certificationValidity: 2,
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
    certificationBody: null,
    certificationValidity: null,
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
    certificationBody: null,
    certificationValidity: null,
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
    certificationBody: null,
    certificationValidity: null,
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
  {
    name: 'Data Analytics with Python',
    type: 'TECHNICAL',
    mode: 'ONLINE' as const,
    duration: '24 hours',
    mandatory: false,
    vendorProvider: 'Coursera',
    costPerHead: 8000,
    certificationName: 'Data Analytics Professional',
    certificationBody: 'Google',
    certificationValidity: 3,
  },
  {
    name: 'Agile & Scrum Fundamentals',
    type: 'SOFT_SKILLS',
    mode: 'WORKSHOP' as const,
    duration: '8 hours',
    mandatory: false,
    vendorProvider: 'Scrum Alliance',
    costPerHead: 12000,
    certificationName: 'CSM',
    certificationBody: 'Scrum Alliance',
    certificationValidity: 2,
  },
];

const EXTERNAL_TRAINERS = [
  { name: 'Dr. Priya Ramanathan', email: 'priya.ram@trainerpro.in', phone: '9845012345', specializations: ['Leadership', 'Communication'], qualifications: ['PhD Org Behaviour', 'ICF Certified Coach'], experienceYears: 15 },
  { name: 'Rajesh Kulkarni', email: 'rajesh.k@awstraining.com', phone: '9900123456', specializations: ['AWS', 'Cloud Architecture', 'DevOps'], qualifications: ['AWS Solutions Architect Pro', 'M.Tech CS'], experienceYears: 12 },
];

const MATERIAL_TYPES = ['PDF', 'VIDEO', 'LINK', 'PRESENTATION', 'DOCUMENT'] as const;

const MATERIAL_NAMES = [
  'Course Introduction Slides',
  'Module 1 - Foundations',
  'Module 2 - Intermediate Concepts',
  'Module 3 - Advanced Topics',
  'Practice Exercises',
  'Reference Handbook',
  'Assessment Questions',
  'Supplementary Reading',
];

const PROGRAM_DATA = [
  {
    name: 'New Joiner Onboarding Program',
    description: 'Comprehensive onboarding covering company policies, safety, and POSH training for all new employees.',
    category: 'ONBOARDING',
    level: 'BEGINNER',
    totalDuration: '12 hours',
    isCompulsory: true,
  },
  {
    name: 'Technical Excellence Track',
    description: 'Multi-course technical upskilling program for engineering team members covering modern frameworks and cloud.',
    category: 'TECHNICAL',
    level: 'ADVANCED',
    totalDuration: '48 hours',
    isCompulsory: false,
  },
];

const VENUES = [
  'Conference Room A - 2nd Floor',
  'Training Hall - Ground Floor',
  'Board Room - 5th Floor',
  'Open Auditorium',
  'Virtual (Teams)',
  'Virtual (Zoom)',
];

const SESSION_NOTES = [
  'Please arrive 15 minutes early for registration.',
  'Bring your laptop with required software pre-installed.',
  'Refreshments will be provided during breaks.',
  'This is a mandatory session for all nominated employees.',
  'Certificates will be issued upon successful completion.',
];

// ── Seeder ──

const seed = async (ctx: SeedContext): Promise<void> => {
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );

  if (activeEmployees.length === 0) {
    log('training', 'No active employees found. Skipping training seeder.');
    return;
  }

  // ── 1. Create TrainingCatalogue entries ──
  const catalogues: { id: string; name: string; costPerHead: number; hasCert: boolean }[] = [];

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
          certificationBody: data.certificationBody ?? undefined,
          certificationValidity: data.certificationValidity ?? undefined,
          proficiencyGain: randomInt(1, 3),
          isActive: true,
          companyId: ctx.companyId,
        },
      });
      catalogues.push({ id: catalogue.id, name: catalogue.name, costPerHead: data.costPerHead, hasCert: !!data.certificationName });
    } catch {
      const existing = await ctx.prisma.trainingCatalogue.findFirst({
        where: { companyId: ctx.companyId, name: data.name },
      });
      if (existing) {
        catalogues.push({ id: existing.id, name: existing.name, costPerHead: data.costPerHead, hasCert: !!data.certificationName });
      }
    }
  }
  vlog(ctx, 'training', `Created/found ${catalogues.length} training catalogue entries`);

  // ── 2. Create Trainers (internal + external) ──
  const trainers: { id: string; isInternal: boolean }[] = [];

  // Internal trainers from existing employees (pick 2 senior ones)
  const internalTrainerEmployees = pickRandomN(activeEmployees, 2);
  for (const emp of internalTrainerEmployees) {
    try {
      const trainer = await ctx.prisma.trainer.create({
        data: {
          employeeId: emp.id,
          specializations: [pickRandom(['Communication', 'Safety', 'Compliance', 'Process', 'Quality'])],
          qualifications: pickRandom(['Certified Trainer', 'Subject Matter Expert', 'Senior Faculty']),
          experienceYears: randomInt(5, 15),
          averageRating: randomDecimal(3.5, 4.8, 1),
          totalSessions: randomInt(5, 25),
          isInternal: true,
          isActive: true,
          companyId: ctx.companyId,
        } as any,
      });
      trainers.push({ id: trainer.id, isInternal: true });
    } catch {
      // Skip if already exists (unique constraint on employeeId)
    }
  }

  // External trainers
  for (const ext of EXTERNAL_TRAINERS) {
    try {
      const trainer = await ctx.prisma.trainer.create({
        data: {
          externalName: ext.name,
          email: ext.email,
          phone: ext.phone,
          specializations: ext.specializations,
          qualifications: ext.qualifications.join(', '),
          experienceYears: ext.experienceYears,
          averageRating: randomDecimal(4.0, 4.9, 1),
          totalSessions: randomInt(20, 80),
          isInternal: false,
          isActive: true,
          companyId: ctx.companyId,
        } as any,
      });
      trainers.push({ id: trainer.id, isInternal: false });
    } catch {
      // Skip duplicates
    }
  }
  vlog(ctx, 'training', `Created ${trainers.length} trainers`);

  // ── 3. Create Training Materials ──
  let materialCount = 0;
  for (const catalogue of catalogues.slice(0, 6)) {
    const numMaterials = randomInt(2, 4);
    for (let i = 0; i < numMaterials; i++) {
      try {
        await ctx.prisma.trainingMaterial.create({
          data: {
            trainingId: catalogue.id,
            name: MATERIAL_NAMES[i % MATERIAL_NAMES.length],
            type: pickRandom([...MATERIAL_TYPES]),
            url: `https://training.avyerp.com/materials/${catalogue.id}/module-${i + 1}`,
            description: `Training material for ${catalogue.name} - Part ${i + 1}`,
            sequenceOrder: i + 1,
            isMandatory: i === 0, // First material is always mandatory
            isActive: true,
            companyId: ctx.companyId,
          },
        });
        materialCount++;
      } catch {
        // Skip duplicates
      }
    }
  }
  vlog(ctx, 'training', `Created ${materialCount} training materials`);

  // ── 4. Create Training Sessions ──
  const sessions: { id: string; trainingId: string; status: string; startDateTime: Date }[] = [];
  const pastMonths = getPastMonths(ctx.months);

  for (let i = 0; i < 8; i++) {
    const catalogue = catalogues[i % catalogues.length];
    const trainerId = trainers.length > 0 ? pickRandom(trainers).id : undefined;

    const status = weightedPick([
      { value: 'COMPLETED', weight: 50 },
      { value: 'SCHEDULED', weight: 30 },
      { value: 'IN_PROGRESS', weight: 10 },
      { value: 'CANCELLED', weight: 10 },
    ]);

    // Completed sessions are in the past, scheduled are in the future
    let startDateTime: Date;
    let endDateTime: Date;

    if (status === 'COMPLETED' || status === 'CANCELLED') {
      const month = pickRandom(pastMonths);
      startDateTime = new Date(month.year, month.month - 1, randomInt(1, 25), randomInt(9, 14), 0, 0);
      endDateTime = new Date(startDateTime.getTime() + randomInt(2, 8) * 60 * 60 * 1000);
    } else if (status === 'IN_PROGRESS') {
      startDateTime = new Date();
      startDateTime.setHours(9, 0, 0, 0);
      endDateTime = new Date(startDateTime.getTime() + 4 * 60 * 60 * 1000);
    } else {
      // SCHEDULED - future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + randomInt(7, 60));
      startDateTime = new Date(futureDate.getFullYear(), futureDate.getMonth(), futureDate.getDate(), randomInt(9, 14), 0, 0);
      endDateTime = new Date(startDateTime.getTime() + randomInt(2, 8) * 60 * 60 * 1000);
    }

    try {
      const session = await ctx.prisma.trainingSession.create({
        data: {
          trainingId: catalogue.id,
          batchName: `Batch ${String.fromCharCode(65 + i)}`,
          startDateTime,
          endDateTime,
          venue: pickRandom(VENUES),
          meetingLink: status !== 'CLASSROOM' ? `https://meet.avyerp.com/training-${randomInt(1000, 9999)}` : undefined,
          maxParticipants: randomInt(10, 30),
          trainerId,
          status: status as any,
          cancelledReason: status === 'CANCELLED' ? pickRandom(['Trainer unavailable', 'Insufficient participants', 'Rescheduled to next month']) : undefined,
          notes: pickRandom(SESSION_NOTES),
          companyId: ctx.companyId,
        },
      });
      sessions.push({ id: session.id, trainingId: catalogue.id, status, startDateTime });
    } catch {
      // Skip duplicates
    }
  }
  vlog(ctx, 'training', `Created ${sessions.length} training sessions`);

  // ── 5. Create Training Nominations ──
  const nominations: { id: string; employeeId: string; trainingId: string; status: string; sessionId?: string }[] = [];
  const selectedEmployees = pickRandomN(activeEmployees, Math.min(activeEmployees.length, 20));

  for (let i = 0; i < 25 && catalogues.length > 0; i++) {
    const emp = selectedEmployees[i % selectedEmployees.length];
    const catalogue = catalogues[i % catalogues.length];

    // Find a session for this catalogue
    const matchingSessions = sessions.filter(s => s.trainingId === catalogue.id);
    const session = matchingSessions.length > 0 ? pickRandom(matchingSessions) : undefined;

    const status = weightedPick([
      { value: 'COMPLETED', weight: 35 },
      { value: 'IN_PROGRESS', weight: 20 },
      { value: 'APPROVED', weight: 20 },
      { value: 'NOMINATED', weight: 15 },
      { value: 'CANCELLED', weight: 10 },
    ]);

    try {
      const nomination = await ctx.prisma.trainingNomination.create({
        data: {
          employeeId: emp.id,
          trainingId: catalogue.id,
          status: status as any,
          sessionId: session?.id ?? undefined,
          completionDate: status === 'COMPLETED' ? new Date(randomPastDate(ctx.months)) : undefined,
          score: status === 'COMPLETED' ? randomDecimal(60, 100, 1) : undefined,
          certificateUrl: status === 'COMPLETED' && catalogue.hasCert
            ? `https://certs.avyerp.com/${emp.id}/${catalogue.id}`
            : undefined,
          certificateNumber: status === 'COMPLETED' && catalogue.hasCert
            ? `CERT-${randomInt(10000, 99999)}`
            : undefined,
          certificateIssuedAt: status === 'COMPLETED' && catalogue.hasCert
            ? new Date(randomPastDate(ctx.months))
            : undefined,
          certificateExpiryDate: status === 'COMPLETED' && catalogue.hasCert
            ? new Date(new Date().getFullYear() + 2, randomInt(0, 11), randomInt(1, 28))
            : undefined,
          certificateStatus: status === 'COMPLETED' && catalogue.hasCert
            ? (weightedPick([{ value: 'EARNED', weight: 80 }, { value: 'EXPIRING_SOON', weight: 15 }, { value: 'EXPIRED', weight: 5 }]) as any)
            : undefined,
          companyId: ctx.companyId,
        },
      });
      nominations.push({ id: nomination.id, employeeId: emp.id, trainingId: catalogue.id, status, sessionId: session?.id });
    } catch {
      // Skip duplicates
    }
  }
  vlog(ctx, 'training', `Created ${nominations.length} training nominations`);

  // ── 6. Create Training Attendance ──
  let attendanceCount = 0;
  const completedSessions = sessions.filter(s => s.status === 'COMPLETED' || s.status === 'IN_PROGRESS');

  for (const session of completedSessions) {
    // Get nominations for this session
    const sessionNominations = nominations.filter(n => n.sessionId === session.id);
    // Also assign some random employees to sessions without nominations
    const sessionEmployees = sessionNominations.length > 0
      ? sessionNominations.map(n => ({ empId: n.employeeId, nomId: n.id }))
      : pickRandomN(activeEmployees, randomInt(4, 8)).map(e => ({ empId: e.id, nomId: undefined as string | undefined }));

    for (const { empId, nomId } of sessionEmployees) {
      const attendanceStatus = weightedPick([
        { value: 'PRESENT', weight: 60 },
        { value: 'LATE', weight: 15 },
        { value: 'ABSENT', weight: 15 },
        { value: 'EXCUSED', weight: 10 },
      ]);

      const checkInTime = attendanceStatus === 'PRESENT' || attendanceStatus === 'LATE'
        ? new Date(session.startDateTime.getTime() + (attendanceStatus === 'LATE' ? randomInt(10, 30) : randomInt(-5, 5)) * 60 * 1000)
        : undefined;
      const checkOutTime = checkInTime
        ? new Date(checkInTime.getTime() + randomInt(2, 6) * 60 * 60 * 1000)
        : undefined;
      const hoursAttended = checkInTime && checkOutTime
        ? parseFloat(((checkOutTime.getTime() - checkInTime.getTime()) / (60 * 60 * 1000)).toFixed(1))
        : undefined;

      try {
        await ctx.prisma.trainingAttendance.create({
          data: {
            sessionId: session.id,
            employeeId: empId,
            nominationId: nomId ?? undefined,
            status: attendanceStatus as any,
            checkInTime,
            checkOutTime,
            hoursAttended,
            remarks: attendanceStatus === 'ABSENT' ? pickRandom(['On leave', 'Client meeting conflict', 'No reason provided']) : undefined,
            companyId: ctx.companyId,
          },
        });
        attendanceCount++;
      } catch {
        // Skip duplicates (unique: sessionId + employeeId)
      }
    }
  }
  vlog(ctx, 'training', `Created ${attendanceCount} attendance records`);

  // ── 7. Create Training Evaluations ──
  let evalCount = 0;
  const completedNominations = nominations.filter(n => n.status === 'COMPLETED' || n.status === 'IN_PROGRESS');

  for (const nom of completedNominations) {
    // Participant feedback
    try {
      await ctx.prisma.trainingEvaluation.create({
        data: {
          trainingId: nom.trainingId,
          nominationId: nom.id,
          sessionId: nom.sessionId ?? undefined,
          type: 'PARTICIPANT_FEEDBACK',
          contentRelevance: randomInt(3, 5),
          trainerEffectiveness: randomInt(3, 5),
          overallSatisfaction: randomInt(3, 5),
          knowledgeGain: randomInt(2, 5),
          practicalApplicability: randomInt(2, 5),
          preAssessmentScore: randomDecimal(30, 60, 0),
          postAssessmentScore: randomDecimal(65, 95, 0),
          comments: pickRandom([
            'Very informative and well-structured session.',
            'Good content but could use more practical examples.',
            'Excellent trainer, very engaging delivery.',
            'Would recommend to colleagues. Learned a lot.',
            'Pace was a bit fast but overall very useful.',
          ]),
          improvementSuggestions: pickRandom([
            'More hands-on exercises would be helpful.',
            'Provide recorded sessions for revision.',
            'Include more real-world case studies.',
            'Extend duration for complex topics.',
            null,
          ]) ?? undefined,
          submittedBy: nom.employeeId,
          submittedAt: new Date(randomPastDate(ctx.months)),
          companyId: ctx.companyId,
        },
      });
      evalCount++;
    } catch {
      // Skip duplicates
    }

    // Trainer assessment (for ~50% of completed nominations)
    if (Math.random() > 0.5) {
      try {
        await ctx.prisma.trainingEvaluation.create({
          data: {
            trainingId: nom.trainingId,
            nominationId: nom.id,
            sessionId: nom.sessionId ?? undefined,
            type: 'TRAINER_ASSESSMENT',
            contentRelevance: randomInt(3, 5),
            trainerEffectiveness: randomInt(3, 5),
            overallSatisfaction: randomInt(3, 5),
            knowledgeGain: randomInt(3, 5),
            practicalApplicability: randomInt(3, 5),
            preAssessmentScore: randomDecimal(35, 55, 0),
            postAssessmentScore: randomDecimal(70, 98, 0),
            comments: pickRandom([
              'Participant showed significant improvement.',
              'Good grasp of fundamentals, needs more practice on advanced topics.',
              'Active participation throughout the session.',
              'Demonstrated excellent problem-solving skills.',
            ]),
            submittedBy: trainers.length > 0 ? pickRandom(internalTrainerEmployees).id : nom.employeeId,
            submittedAt: new Date(randomPastDate(ctx.months)),
            companyId: ctx.companyId,
          },
        });
        evalCount++;
      } catch {
        // Skip duplicates
      }
    }
  }
  vlog(ctx, 'training', `Created ${evalCount} evaluations`);

  // ── 8. Create Training Programs ──
  const programs: { id: string; name: string }[] = [];

  for (const progData of PROGRAM_DATA) {
    try {
      const program = await ctx.prisma.trainingProgram.create({
        data: {
          name: progData.name,
          description: progData.description,
          category: progData.category,
          level: progData.level,
          totalDuration: progData.totalDuration,
          isCompulsory: progData.isCompulsory,
          isActive: true,
          companyId: ctx.companyId,
        },
      });
      programs.push({ id: program.id, name: program.name });
    } catch {
      const existing = await ctx.prisma.trainingProgram.findFirst({
        where: { companyId: ctx.companyId, name: progData.name },
      });
      if (existing) programs.push({ id: existing.id, name: existing.name });
    }
  }
  vlog(ctx, 'training', `Created ${programs.length} training programs`);

  // ── 9. Create TrainingProgramCourses (link catalogues to programs) ──
  let courseCount = 0;
  if (programs.length > 0 && catalogues.length >= 4) {
    // Onboarding program: POSH + First Aid + Communication
    const onboardingCourses = [catalogues[1], catalogues[4], catalogues[2]]; // POSH, First Aid, Communication
    for (let i = 0; i < onboardingCourses.length; i++) {
      try {
        await ctx.prisma.trainingProgramCourse.create({
          data: {
            programId: programs[0].id,
            trainingId: onboardingCourses[i].id,
            sequenceOrder: i + 1,
            isPrerequisite: i === 0, // POSH is prerequisite
            minPassScore: 70,
            companyId: ctx.companyId,
          },
        });
        courseCount++;
      } catch {
        // Skip duplicates (unique: programId + trainingId)
      }
    }

    // Technical program: React + AWS + Python + Agile
    if (programs.length > 1 && catalogues.length >= 8) {
      const techCourses = [catalogues[7], catalogues[0], catalogues[6], catalogues[3]]; // Agile, React, Python, AWS
      for (let i = 0; i < techCourses.length; i++) {
        try {
          await ctx.prisma.trainingProgramCourse.create({
            data: {
              programId: programs[1].id,
              trainingId: techCourses[i].id,
              sequenceOrder: i + 1,
              isPrerequisite: i < 2, // Agile & React are prerequisites for advanced
              minPassScore: 75,
              companyId: ctx.companyId,
            },
          });
          courseCount++;
        } catch {
          // Skip duplicates
        }
      }
    }
  }
  vlog(ctx, 'training', `Created ${courseCount} program courses`);

  // ── 10. Create TrainingProgramEnrollments ──
  let enrollmentCount = 0;
  for (const program of programs) {
    const enrollees = pickRandomN(activeEmployees, randomInt(4, 8));
    for (const emp of enrollees) {
      const enrollStatus = weightedPick([
        { value: 'COMPLETED', weight: 30 },
        { value: 'IN_PROGRESS', weight: 40 },
        { value: 'ENROLLED', weight: 20 },
        { value: 'ABANDONED', weight: 10 },
      ]);

      try {
        await ctx.prisma.trainingProgramEnrollment.create({
          data: {
            programId: program.id,
            employeeId: emp.id,
            enrolledAt: new Date(randomPastDate(ctx.months)),
            completedAt: enrollStatus === 'COMPLETED' ? new Date(randomPastDate(1)) : undefined,
            status: enrollStatus as any,
            progressPercent: enrollStatus === 'COMPLETED' ? 100
              : enrollStatus === 'IN_PROGRESS' ? randomInt(20, 80)
              : enrollStatus === 'ENROLLED' ? 0
              : randomInt(5, 40),
            companyId: ctx.companyId,
          },
        });
        enrollmentCount++;
      } catch {
        // Skip duplicates (unique: programId + employeeId)
      }
    }
  }
  vlog(ctx, 'training', `Created ${enrollmentCount} program enrollments`);

  // ── 11. Create Training Budgets ──
  let budgetCount = 0;
  const currentYear = new Date().getFullYear();
  const fiscalYear = `${currentYear}-${currentYear + 1}`;

  // Company-wide budget
  try {
    await ctx.prisma.trainingBudget.create({
      data: {
        fiscalYear,
        allocatedAmount: randomInt(500000, 2000000),
        usedAmount: randomInt(100000, 800000),
        companyId: ctx.companyId,
      },
    });
    budgetCount++;
  } catch {
    // Skip if already exists
  }

  // Per-department budgets (top 4 departments)
  const budgetDepts = ctx.departmentIds.slice(0, Math.min(4, ctx.departmentIds.length));
  for (const deptId of budgetDepts) {
    try {
      await ctx.prisma.trainingBudget.create({
        data: {
          fiscalYear,
          departmentId: deptId,
          allocatedAmount: randomInt(100000, 500000),
          usedAmount: randomInt(20000, 200000),
          companyId: ctx.companyId,
        },
      });
      budgetCount++;
    } catch {
      // Skip duplicates (unique: fiscalYear + companyId + departmentId)
    }
  }
  vlog(ctx, 'training', `Created ${budgetCount} training budgets`);

  // ── Summary ──
  log('training', `Seeded: ${catalogues.length} catalogues, ${trainers.length} trainers, ${sessions.length} sessions, ${nominations.length} nominations, ${attendanceCount} attendance, ${evalCount} evaluations, ${programs.length} programs, ${courseCount} courses, ${enrollmentCount} enrollments, ${budgetCount} budgets, ${materialCount} materials`);
};

const module: SeederModule = {
  name: 'training',
  order: 10,
  seed,
};

export default module;
