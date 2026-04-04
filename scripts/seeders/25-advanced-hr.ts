import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, randomDecimal } from './utils';

const MODULE = 'advanced-hr';

export const seeder: SeederModule = {
  name: 'Advanced HR',
  order: 25,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, departmentIds, shiftIds, locationIds } = ctx;

    // ── Biometric Devices ──
    const existingDevices = await prisma.biometricDevice.count({ where: { companyId } });
    if (existingDevices === 0) {
      const devices = [
        {
          companyId,
          name: 'Main Entrance Biometric',
          brand: 'ZKTeco',
          deviceId: 'ZK-ENT-001',
          ipAddress: '192.168.1.100',
          port: 4370,
          syncMode: 'PULL',
          syncIntervalMin: 5,
          locationId: locationIds[0] || null,
          status: 'ACTIVE',
          enrolledCount: Math.min(employeeIds.length, 50),
          lastSyncAt: new Date(),
          lastSyncStatus: 'SUCCESS',
        },
        {
          companyId,
          name: 'Factory Floor Scanner',
          brand: 'eSSL',
          deviceId: 'ESSL-FAC-002',
          ipAddress: '192.168.1.101',
          port: 4370,
          syncMode: 'PUSH',
          syncIntervalMin: 10,
          locationId: locationIds[0] || null,
          status: 'ACTIVE',
          enrolledCount: Math.min(employeeIds.length, 30),
          lastSyncAt: new Date(Date.now() - 3600000),
          lastSyncStatus: 'SUCCESS',
        },
      ];
      await prisma.biometricDevice.createMany({ data: devices });
      vlog(ctx, MODULE, `Created ${devices.length} biometric devices`);
    } else {
      vlog(ctx, MODULE, `Skipping biometric devices — ${existingDevices} already exist`);
    }

    // ── Shift Rotation Schedule ──
    const existingSchedules = await prisma.shiftRotationSchedule.count({ where: { companyId } });
    if (existingSchedules === 0 && shiftIds.length >= 2) {
      const schedule = await prisma.shiftRotationSchedule.create({
        data: {
          companyId,
          name: 'Weekly Rotation — General',
          rotationPattern: 'WEEKLY',
          shifts: JSON.stringify([
            { shiftId: shiftIds[0], weekNumber: 1 },
            { shiftId: shiftIds[1] || shiftIds[0], weekNumber: 2 },
            { shiftId: shiftIds[0], weekNumber: 3 },
            { shiftId: shiftIds[1] || shiftIds[0], weekNumber: 4 },
          ]),
          effectiveFrom: new Date(new Date().getFullYear(), 0, 1), // Jan 1
          isActive: true,
        },
      });

      // Assign 5 employees to the rotation
      const rotationEmployees = pickRandomN(employeeIds, Math.min(5, employeeIds.length));
      const assignments = rotationEmployees.map((employeeId) => ({
        scheduleId: schedule.id,
        employeeId,
        companyId,
      }));
      await prisma.shiftRotationAssignment.createMany({
        data: assignments,
        skipDuplicates: true,
      });
      vlog(ctx, MODULE, `Created shift rotation schedule with ${assignments.length} assignments`);
    } else {
      vlog(ctx, MODULE, `Skipping shift rotation — ${existingSchedules} schedules exist or insufficient shifts`);
    }

    // ── Production Incentive Configs ──
    const existingConfigs = await prisma.productionIncentiveConfig.count({ where: { companyId } });
    if (existingConfigs === 0) {
      const configs = [
        {
          companyId,
          name: 'Assembly Line Output Incentive',
          incentiveBasis: 'COMPONENT_WISE',
          calculationCycle: 'MONTHLY',
          slabs: JSON.stringify([
            { minOutput: 100, maxOutput: 150, amount: 500 },
            { minOutput: 151, maxOutput: 200, amount: 1000 },
            { minOutput: 201, maxOutput: 999, amount: 1500 },
          ]),
          departmentId: departmentIds[0] || null,
          isActive: true,
        },
        {
          companyId,
          name: 'Quality Bonus — Finishing',
          incentiveBasis: 'MODEL_WISE',
          calculationCycle: 'MONTHLY',
          slabs: JSON.stringify([
            { minOutput: 50, maxOutput: 100, amount: 750 },
            { minOutput: 101, maxOutput: 200, amount: 1250 },
            { minOutput: 201, maxOutput: 999, amount: 2000 },
          ]),
          departmentId: departmentIds.length > 1 ? departmentIds[1] : departmentIds[0] || null,
          isActive: true,
        },
      ];
      const createdConfigs = [];
      for (const cfg of configs) {
        const created = await prisma.productionIncentiveConfig.create({ data: cfg });
        createdConfigs.push(created);
      }
      vlog(ctx, MODULE, `Created ${createdConfigs.length} production incentive configs`);

      // ── Production Incentive Records ──
      const incentiveEmployees = pickRandomN(employeeIds, Math.min(5, employeeIds.length));
      const incentiveRecords = incentiveEmployees.map((employeeId, idx) => {
        const config = createdConfigs[idx % createdConfigs.length];
        const outputUnits = randomDecimal(80, 250, 0);
        let incentiveAmount = 0;
        const slabs = JSON.parse(config.slabs as string) as Array<{ minOutput: number; maxOutput: number; amount: number }>;
        for (const slab of slabs) {
          if (outputUnits >= slab.minOutput && outputUnits <= slab.maxOutput) {
            incentiveAmount = slab.amount;
            break;
          }
        }
        return {
          configId: config.id,
          employeeId,
          companyId,
          periodDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
          outputUnits,
          incentiveAmount: incentiveAmount || 500,
          status: 'COMPUTED',
        };
      });
      await prisma.productionIncentiveRecord.createMany({ data: incentiveRecords });
      vlog(ctx, MODULE, `Created ${incentiveRecords.length} production incentive records`);
    } else {
      vlog(ctx, MODULE, `Skipping production incentive — ${existingConfigs} configs exist`);
    }

    // ── Data Retention Policies ──
    const existingPolicies = await prisma.dataRetentionPolicy.count({ where: { companyId } });
    if (existingPolicies === 0) {
      const policies = [
        {
          companyId,
          dataCategory: 'Employee Data',
          retentionYears: 7,
          actionAfter: 'ARCHIVE',
          isActive: true,
        },
        {
          companyId,
          dataCategory: 'Payroll Data',
          retentionYears: 10,
          actionAfter: 'ARCHIVE',
          isActive: true,
        },
        {
          companyId,
          dataCategory: 'Attendance Data',
          retentionYears: 5,
          actionAfter: 'DELETE',
          isActive: true,
        },
      ];
      await prisma.dataRetentionPolicy.createMany({
        data: policies,
        skipDuplicates: true,
      });
      vlog(ctx, MODULE, `Created ${policies.length} data retention policies`);
    } else {
      vlog(ctx, MODULE, `Skipping data retention — ${existingPolicies} policies exist`);
    }

    // ── Summary ──
    const finalDevices = await prisma.biometricDevice.count({ where: { companyId } });
    const finalSchedules = await prisma.shiftRotationSchedule.count({ where: { companyId } });
    const finalConfigs = await prisma.productionIncentiveConfig.count({ where: { companyId } });
    const finalRecords = await prisma.productionIncentiveRecord.count({ where: { companyId } });
    const finalPolicies = await prisma.dataRetentionPolicy.count({ where: { companyId } });

    log(
      MODULE,
      `Done — ${finalDevices} devices, ${finalSchedules} rotation schedules, ${finalConfigs} incentive configs, ${finalRecords} incentive records, ${finalPolicies} retention policies`,
    );
  },
};
