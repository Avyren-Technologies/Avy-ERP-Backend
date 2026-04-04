import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, randomDecimal, weightedPick } from './utils';

const MODULE = 'requests';

const SHIFT_SWAP_REASONS = [
  'Personal appointment in the morning',
  'Family event in the evening',
  'Need to pick up child from school',
  'Medical follow-up scheduled',
  'Attending a professional course',
  'Coordination with overseas client',
  'Commute issue — road construction on usual route',
  'Volunteering commitment',
];

const WFH_REASONS = [
  'Plumber visit for home repair',
  'Delivery of important documents at home',
  'Mild illness — can work but prefer rest at home',
  'Internet setup at new apartment',
  'Waiting for gas connection installation',
  'Heavy rain and waterlogging — unsafe commute',
  'Parent-teacher meeting at school',
  'Deep focus work — no meetings day',
];

const OT_REASONS = [
  'Quarter-end reporting deadline',
  'Production line support for urgent order',
  'Client demo preparation',
  'System migration — weekend deployment',
  'Inventory stocktake assistance',
];

export const seeder: SeederModule = {
  name: 'Requests',
  order: 18,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap, shiftIds } = ctx;

    const statusWeights = [
      { value: 'APPROVED', weight: 50 },
      { value: 'PENDING', weight: 30 },
      { value: 'REJECTED', weight: 20 },
    ];

    // ── Shift Swap Requests ──
    let swapsCreated = 0;
    if (shiftIds.length >= 2) {
      const swapCount = randomInt(5, 8);
      const swapEmployees = pickRandomN(employeeIds, swapCount);

      for (let i = 0; i < swapCount; i++) {
        const employeeId = swapEmployees[i % swapEmployees.length];
        const emp = employeeMap.get(employeeId);
        const status = weightedPick(statusWeights);
        const currentShiftId = emp?.shiftId || shiftIds[0];
        const requestedShiftId = shiftIds.find((s) => s !== currentShiftId) || shiftIds[1];

        await prisma.shiftSwapRequest.create({
          data: {
            companyId,
            employeeId,
            currentShiftId,
            requestedShiftId,
            swapDate: new Date(randomPastDate(randomInt(0, 2))),
            reason: pickRandom(SHIFT_SWAP_REASONS),
            status,
            approvedBy: status === 'APPROVED' ? 'system-seed' : undefined,
            approvedAt: status === 'APPROVED' ? new Date(randomPastDate(1)) : undefined,
          },
        });
        swapsCreated++;
      }
      vlog(ctx, MODULE, `Created ${swapsCreated} shift swap requests`);
    }

    // ── WFH Requests ──
    const wfhCount = randomInt(5, 8);
    const wfhEmployees = pickRandomN(employeeIds, wfhCount);
    let wfhCreated = 0;

    for (let i = 0; i < wfhCount; i++) {
      const employeeId = wfhEmployees[i % wfhEmployees.length];
      const status = weightedPick(statusWeights);
      const fromDate = randomPastDate(randomInt(0, 2));
      const days = randomInt(1, 3);
      const toDateObj = new Date(fromDate);
      toDateObj.setDate(toDateObj.getDate() + days - 1);

      await prisma.wfhRequest.create({
        data: {
          companyId,
          employeeId,
          fromDate: new Date(fromDate),
          toDate: toDateObj,
          days,
          reason: pickRandom(WFH_REASONS),
          status,
          approvedBy: status === 'APPROVED' ? 'system-seed' : undefined,
          approvedAt: status === 'APPROVED' ? new Date(randomPastDate(1)) : undefined,
        },
      });
      wfhCreated++;
    }
    vlog(ctx, MODULE, `Created ${wfhCreated} WFH requests`);

    // ── Overtime Requests ──
    // OT requests require an attendance record and overtime rule
    const overtimeRule = await prisma.overtimeRule.findUnique({
      where: { companyId },
      select: { id: true },
    });

    let otCreated = 0;
    if (overtimeRule) {
      const otCount = randomInt(5, 8);
      const otEmployees = pickRandomN(employeeIds, otCount);

      for (let i = 0; i < otCount; i++) {
        const employeeId = otEmployees[i % otEmployees.length];
        const otDate = randomPastDate(randomInt(1, 3));
        const status = weightedPick([
          { value: 'APPROVED', weight: 50 },
          { value: 'PENDING', weight: 30 },
          { value: 'REJECTED', weight: 20 },
        ]);

        // Find an attendance record for this employee
        const attendanceRecord = await prisma.attendanceRecord.findFirst({
          where: { employeeId, companyId },
          select: { id: true, date: true },
          orderBy: { date: 'desc' },
        });

        if (!attendanceRecord) continue;

        // Check if OT request already exists for this attendance
        const existingOt = await prisma.overtimeRequest.findUnique({
          where: { attendanceRecordId: attendanceRecord.id },
        });
        if (existingOt) continue;

        const requestedHours = randomDecimal(1, 4, 1);
        const multiplier = 1.5;

        await prisma.overtimeRequest.create({
          data: {
            companyId,
            employeeId,
            attendanceRecordId: attendanceRecord.id,
            overtimeRuleId: overtimeRule.id,
            date: attendanceRecord.date,
            requestedHours,
            appliedMultiplier: multiplier,
            multiplierSource: 'WEEKDAY',
            calculatedAmount: Math.round(requestedHours * multiplier * 500),
            status: status as 'APPROVED' | 'PENDING' | 'REJECTED',
            requestedBy: employeeId,
            approvedBy: status === 'APPROVED' ? 'system-seed' : undefined,
            approvedAt: status === 'APPROVED' ? new Date(randomPastDate(1)) : undefined,
          },
        });
        otCreated++;
      }
      vlog(ctx, MODULE, `Created ${otCreated} overtime requests`);
    } else {
      vlog(ctx, MODULE, 'No overtime rule found — skipping OT requests');
    }

    // ── IT Declarations ──
    const itCount = randomInt(5, 10);
    const itEmployees = pickRandomN(employeeIds, itCount);
    let itCreated = 0;

    for (let i = 0; i < itCount; i++) {
      const employeeId = itEmployees[i % itEmployees.length];
      const regime = Math.random() > 0.6 ? 'OLD' : 'NEW';
      const status = weightedPick([
        { value: 'SUBMITTED' as const, weight: 40 },
        { value: 'VERIFIED' as const, weight: 30 },
        { value: 'DRAFT' as const, weight: 20 },
        { value: 'LOCKED' as const, weight: 10 },
      ]);

      // Check unique constraint
      const exists = await prisma.iTDeclaration.findUnique({
        where: { employeeId_financialYear: { employeeId, financialYear: '2025-26' } },
      });
      if (exists) continue;

      const section80C =
        regime === 'OLD'
          ? {
              lic: randomInt(10000, 50000),
              ppf: randomInt(0, 150000),
              elss: randomInt(0, 50000),
              nsc: 0,
              homeLoanPrincipal: 0,
              schoolFees: randomInt(0, 30000),
              total: 0, // will be computed
            }
          : undefined;
      if (section80C) section80C.total = section80C.lic + section80C.ppf + section80C.elss + section80C.schoolFees;

      const section80D =
        regime === 'OLD'
          ? {
              selfPremium: randomInt(5000, 25000),
              parentPremium: randomInt(0, 30000),
              seniorCitizen: false,
            }
          : undefined;

      const hraExemption =
        regime === 'OLD' && Math.random() > 0.4
          ? {
              rentPaid: randomInt(8000, 25000) * 12,
              landlordPan: Math.random() > 0.5 ? 'ABCDE1234F' : undefined,
              landlordName: 'Landlord Name',
              cityType: Math.random() > 0.5 ? 'METRO' : 'NON_METRO',
            }
          : undefined;

      await prisma.iTDeclaration.create({
        data: {
          companyId,
          employeeId,
          financialYear: '2025-26',
          regime,
          section80C: section80C || undefined,
          section80D: section80D || undefined,
          hraExemption: hraExemption || undefined,
          status: status as 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'LOCKED',
          submittedAt: status !== 'DRAFT' ? new Date(randomPastDate(2)) : undefined,
          verifiedBy: status === 'VERIFIED' || status === 'LOCKED' ? 'system-seed' : undefined,
          verifiedAt: status === 'VERIFIED' || status === 'LOCKED' ? new Date(randomPastDate(1)) : undefined,
        },
      });
      itCreated++;
    }
    vlog(ctx, MODULE, `Created ${itCreated} IT declarations`);

    log(
      MODULE,
      `Created ${swapsCreated} shift swaps, ${wfhCreated} WFH, ${otCreated} OT requests, ${itCreated} IT declarations`,
    );
  },
};
