import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  randomInt,
  randomDecimal,
  pickRandom,
  pickRandomN,
  weightedPick,
  randomPastDate,
} from './utils';

const LEAVE_REASONS = [
  'Personal work',
  'Family function',
  'Medical appointment',
  'Fever and cold',
  'Family emergency',
  'Travel plans',
  'House shifting',
  'Child school event',
  'Festival preparation',
  'Health check-up',
  'Vehicle service',
  'Bank and government work',
  'Dental appointment',
  'Wedding in family',
  'Out of station',
];

const seed = async (ctx: SeedContext): Promise<void> => {
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );

  // Fetch leave types for this company
  const leaveTypes = await ctx.prisma.leaveType.findMany({
    where: { companyId: ctx.companyId, isActive: true },
  });

  if (leaveTypes.length === 0) {
    log('leave', 'No leave types found — skipping leave seeder');
    return;
  }

  const currentYear = new Date().getFullYear();

  // ── 1. Create LeaveBalance for each employee x each leave type ──
  const balanceRecords: Parameters<typeof ctx.prisma.leaveBalance.createMany>[0]['data'] = [];

  for (const emp of activeEmployees) {
    for (const lt of leaveTypes) {
      const annualEntitlement = Number(lt.annualEntitlement);
      const monthsWorked = Math.min(ctx.months, 12);
      const accrued = parseFloat(((annualEntitlement / 12) * monthsWorked).toFixed(1));
      const taken = randomDecimal(0, Math.min(3, accrued), 1);
      const balance = parseFloat((accrued - taken).toFixed(1));

      balanceRecords.push({
        employeeId: emp.id,
        leaveTypeId: lt.id,
        year: currentYear,
        openingBalance: 0,
        accrued,
        taken,
        adjusted: 0,
        balance: Math.max(0, balance),
        companyId: ctx.companyId,
      });
    }
  }

  if (balanceRecords.length > 0) {
    const balResult = await ctx.prisma.leaveBalance.createMany({
      data: balanceRecords,
      skipDuplicates: true,
    });
    vlog(ctx, 'leave', `Created ${balResult.count} leave balances`);
  }

  // ── 2. Create LeaveRequests ──
  const requestCount = randomInt(30, 50);
  const statusDistribution: { value: string; weight: number }[] = [
    { value: 'APPROVED', weight: 70 },
    { value: 'PENDING', weight: 15 },
    { value: 'REJECTED', weight: 10 },
    { value: 'CANCELLED', weight: 5 },
  ];

  // Build leave type map by code for duration logic
  const leaveTypeByCode = new Map(leaveTypes.map((lt) => [lt.code, lt]));
  const clType = leaveTypeByCode.get('CL');
  const slType = leaveTypeByCode.get('SL');
  const elType = leaveTypeByCode.get('EL') || leaveTypeByCode.get('PL');

  // Preferred types for requests, weighted towards CL
  const typeChoices = [
    ...(clType ? [{ value: clType, weight: 40 }] : []),
    ...(slType ? [{ value: slType, weight: 30 }] : []),
    ...(elType ? [{ value: elType, weight: 20 }] : []),
    ...leaveTypes
      .filter((lt) => !['CL', 'SL', 'EL', 'PL'].includes(lt.code))
      .map((lt) => ({ value: lt, weight: 5 })),
  ];

  // Fallback if no standard types found
  const requestLeaveTypes = typeChoices.length > 0
    ? typeChoices
    : leaveTypes.map((lt) => ({ value: lt, weight: 10 }));

  let createdRequests = 0;
  const selectedEmployees = pickRandomN(activeEmployees, Math.min(activeEmployees.length, requestCount));

  for (let i = 0; i < requestCount; i++) {
    const emp = selectedEmployees[i % selectedEmployees.length];
    const leaveType = weightedPick(requestLeaveTypes);
    const status = weightedPick(statusDistribution);

    // Duration based on leave type code
    let days: number;
    const code = leaveType.code;
    if (code === 'CL') {
      days = randomInt(1, 2);
    } else if (code === 'SL') {
      days = randomInt(1, 3);
    } else if (code === 'EL' || code === 'PL') {
      days = randomInt(3, 5);
    } else {
      days = randomInt(1, 3);
    }

    const fromDateStr = randomPastDate(ctx.months);
    const fromDate = new Date(fromDateStr);
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + days - 1);

    const isHalfDay = days === 1 && Math.random() < 0.2;

    const approvedBy = status === 'APPROVED' || status === 'REJECTED'
      ? pickRandom(ctx.managerIds)
      : undefined;

    try {
      await ctx.prisma.leaveRequest.create({
        data: {
          employeeId: emp.id,
          leaveTypeId: leaveType.id,
          fromDate,
          toDate,
          days: isHalfDay ? 0.5 : days,
          isHalfDay,
          halfDayType: isHalfDay ? pickRandom(['FIRST_HALF', 'SECOND_HALF']) : undefined,
          reason: pickRandom(LEAVE_REASONS),
          status: status as any,
          approvedBy: approvedBy ?? undefined,
          approvedAt: status === 'APPROVED' ? new Date(fromDateStr) : undefined,
          rejectionNote: status === 'REJECTED' ? 'Insufficient leave balance or team constraint' : undefined,
          cancelledAt: status === 'CANCELLED' ? new Date() : undefined,
          companyId: ctx.companyId,
        },
      });
      createdRequests++;
    } catch {
      // Skip duplicates or constraint violations
    }
  }

  log('leave', `Created ${balanceRecords.length} leave balances and ${createdRequests} leave requests`);
};

const module: SeederModule = {
  name: 'leave',
  order: 6,
  seed,
};

export default module;
