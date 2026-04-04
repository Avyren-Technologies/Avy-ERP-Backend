import type { SeederModule, SeedContext } from './types';
import { log, vlog } from './types';
import {
  getPastMonths,
  getWorkingDays,
  shiftTime,
  buildDateTime,
  randomInt,
  randomDecimal,
  weightedPick,
  pickRandom,
} from './utils';

type AttendanceType = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'OVERTIME';

const ATTENDANCE_DISTRIBUTION: { value: AttendanceType; weight: number }[] = [
  { value: 'PRESENT', weight: 88 },
  { value: 'LATE', weight: 4 },
  { value: 'HALF_DAY', weight: 3 },
  { value: 'ABSENT', weight: 2 },
  { value: 'ON_LEAVE', weight: 2 },
  { value: 'OVERTIME', weight: 1 },
];

const seed = async (ctx: SeedContext): Promise<void> => {
  const pastMonths = getPastMonths(ctx.months);
  const activeEmployees = Array.from(ctx.employeeMap.values()).filter(
    (e) => e.status === 'ACTIVE',
  );

  let totalRecords = 0;
  let totalOvertimeRequests = 0;

  // We need an OvertimeRule for OT requests - find or skip
  const overtimeRule = await ctx.prisma.overtimeRule.findFirst({
    where: { companyId: ctx.companyId },
  });

  for (const { year, month } of pastMonths) {
    const workingDays = getWorkingDays(year, month, ctx.weeklyOffs, ctx.holidays);
    if (workingDays.length === 0) continue;

    const attendanceRecords: Parameters<typeof ctx.prisma.attendanceRecord.createMany>[0]['data'] = [];
    const overtimeData: {
      attendanceDate: string;
      employeeId: string;
      hours: number;
    }[] = [];

    for (const emp of activeEmployees) {
      for (const dateStr of workingDays) {
        // Skip dates before the employee joined
        if (dateStr < emp.joiningDate) continue;

        const type = weightedPick(ATTENDANCE_DISTRIBUTION);

        let status: string;
        let punchIn: string | undefined;
        let punchOut: string | undefined;
        let workedHours: number | undefined;
        let isLate = false;
        let lateMinutes: number | undefined;
        let isEarlyExit = false;
        let earlyMinutes: number | undefined;
        let overtimeHours: number | undefined;

        switch (type) {
          case 'PRESENT': {
            const inTime = shiftTime(9, 0, 15);
            const outTime = shiftTime(18, 0, 30);
            punchIn = buildDateTime(dateStr, inTime);
            punchOut = buildDateTime(dateStr, outTime);
            workedHours = randomDecimal(7.5, 9.5);
            status = 'PRESENT';
            break;
          }
          case 'LATE': {
            const lateIn = shiftTime(9, randomInt(30, 90), 10);
            const outTime = shiftTime(18, 0, 30);
            punchIn = buildDateTime(dateStr, lateIn);
            punchOut = buildDateTime(dateStr, outTime);
            isLate = true;
            lateMinutes = randomInt(15, 90);
            workedHours = randomDecimal(6.5, 8.5);
            status = 'LATE';
            break;
          }
          case 'HALF_DAY': {
            const inTime = shiftTime(9, 0, 15);
            const earlyOut = shiftTime(13, randomInt(0, 60), 10);
            punchIn = buildDateTime(dateStr, inTime);
            punchOut = buildDateTime(dateStr, earlyOut);
            isEarlyExit = true;
            earlyMinutes = randomInt(180, 300);
            workedHours = randomDecimal(3.5, 5.0);
            status = 'HALF_DAY';
            break;
          }
          case 'ABSENT': {
            status = 'ABSENT';
            workedHours = 0;
            break;
          }
          case 'ON_LEAVE': {
            status = 'ON_LEAVE';
            workedHours = 0;
            break;
          }
          case 'OVERTIME': {
            const inTime = shiftTime(9, 0, 10);
            const lateOut = shiftTime(20, randomInt(0, 120), 15);
            punchIn = buildDateTime(dateStr, inTime);
            punchOut = buildDateTime(dateStr, lateOut);
            overtimeHours = randomDecimal(1.0, 3.5);
            workedHours = randomDecimal(9.5, 12.0);
            status = 'PRESENT';

            if (overtimeRule) {
              overtimeData.push({
                attendanceDate: dateStr,
                employeeId: emp.id,
                hours: overtimeHours,
              });
            }
            break;
          }
        }

        attendanceRecords.push({
          employeeId: emp.id,
          date: new Date(dateStr),
          shiftId: emp.shiftId,
          punchIn: punchIn ? new Date(punchIn) : undefined,
          punchOut: punchOut ? new Date(punchOut) : undefined,
          workedHours: workedHours ?? undefined,
          status: status as any,
          source: 'BIOMETRIC' as any,
          isLate,
          lateMinutes: lateMinutes ?? undefined,
          isEarlyExit,
          earlyMinutes: earlyMinutes ?? undefined,
          overtimeHours: overtimeHours ?? undefined,
          locationId: emp.locationId,
          companyId: ctx.companyId,
        });
      }
    }

    // Bulk insert attendance records
    if (attendanceRecords.length > 0) {
      const result = await ctx.prisma.attendanceRecord.createMany({
        data: attendanceRecords,
        skipDuplicates: true,
      });
      totalRecords += result.count;
    }

    // Create overtime requests (need attendanceRecordId, so must query back)
    if (overtimeData.length > 0 && overtimeRule) {
      for (const ot of overtimeData) {
        const record = await ctx.prisma.attendanceRecord.findUnique({
          where: {
            employeeId_date: {
              employeeId: ot.employeeId,
              date: new Date(ot.attendanceDate),
            },
          },
        });
        if (record) {
          const emp = ctx.employeeMap.get(ot.employeeId);
          const requestedBy = emp?.userId ?? ot.employeeId;
          try {
            await ctx.prisma.overtimeRequest.create({
              data: {
                attendanceRecordId: record.id,
                companyId: ctx.companyId,
                employeeId: ot.employeeId,
                overtimeRuleId: overtimeRule.id,
                date: new Date(ot.attendanceDate),
                requestedHours: ot.hours,
                appliedMultiplier: 1.5,
                multiplierSource: 'WEEKDAY',
                status: pickRandom(['PENDING', 'APPROVED', 'PAID'] as const),
                requestedBy,
              },
            });
            totalOvertimeRequests++;
          } catch {
            // Skip if duplicate
          }
        }
      }
    }

    vlog(ctx, 'attendance', `Month ${year}-${String(month).padStart(2, '0')}: ${attendanceRecords.length} records`);
  }

  log('attendance', `Created ${totalRecords} attendance records for ${activeEmployees.length} employees across ${pastMonths.length} months`);
  if (totalOvertimeRequests > 0) {
    log('attendance', `Created ${totalOvertimeRequests} overtime requests`);
  }
};

const module: SeederModule = {
  name: 'attendance',
  order: 5,
  seed,
};

export default module;
