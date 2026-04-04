import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, randomDecimal } from './utils';

const MODULE = 'transfers';

const TRANSFER_REASONS = [
  'Organizational restructuring — team consolidation',
  'Business need — new project requires this skill set',
  'Employee request — relocation to home city',
];

const PROMOTION_REASONS = [
  'Outstanding performance in FY 2025-26',
  'Exceptional leadership during critical project delivery',
  'Consistent high ratings over 2 consecutive appraisal cycles',
];

export const seeder: SeederModule = {
  name: 'Transfers',
  order: 19,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap, departmentIds, designationIds, locationIds, managerIds, gradeMap } = ctx;

    // Check existing
    const existingTransfers = await prisma.employeeTransfer.count({ where: { companyId } });
    if (existingTransfers >= 2) {
      log(MODULE, `Skipping — ${existingTransfers} transfers already exist`);
      return;
    }

    // ── Employee Transfers ──
    const transferCount = randomInt(2, 3);
    const transferEmployees = pickRandomN(employeeIds, transferCount);
    let transfersCreated = 0;

    for (let i = 0; i < transferCount; i++) {
      const employeeId = transferEmployees[i];
      const emp = employeeMap.get(employeeId)!;
      const status = i === 0 ? 'APPLIED' : i === 1 ? 'APPROVED' : 'REQUESTED';

      // Pick a different department and location
      const toDepartmentId = departmentIds.find((d) => d !== emp.departmentId) || departmentIds[0];
      const toLocationId = locationIds.length > 1
        ? locationIds.find((l) => l !== emp.locationId) || locationIds[0]
        : locationIds[0];

      await prisma.employeeTransfer.create({
        data: {
          companyId,
          employeeId,
          fromDepartmentId: emp.departmentId,
          toDepartmentId,
          fromDesignationId: emp.designationId,
          toDesignationId: emp.designationId, // lateral transfer, same designation
          fromLocationId: emp.locationId,
          toLocationId,
          effectiveDate: new Date(randomPastDate(randomInt(0, 2))),
          reason: TRANSFER_REASONS[i % TRANSFER_REASONS.length],
          transferType: i === 2 ? 'RELOCATION' : 'LATERAL',
          status: status as 'APPLIED' | 'APPROVED' | 'REQUESTED',
          approvedBy: status !== 'REQUESTED' ? 'system-seed' : undefined,
          approvedAt: status !== 'REQUESTED' ? new Date(randomPastDate(1)) : undefined,
          appliedAt: status === 'APPLIED' ? new Date(randomPastDate(1)) : undefined,
        },
      });
      transfersCreated++;
      vlog(ctx, MODULE, `Created transfer for ${emp.firstName} (${status})`);
    }

    // ── Employee Promotions ──
    const promoCount = randomInt(2, 3);
    const promoEmployees = pickRandomN(
      employeeIds.filter((id) => !transferEmployees.includes(id)),
      promoCount,
    );
    let promosCreated = 0;

    // Collect designations for promotion targets
    const designations = await prisma.designation.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    const grades = Array.from(gradeMap.values());

    for (let i = 0; i < promoCount; i++) {
      const employeeId = promoEmployees[i];
      if (!employeeId) continue;
      const emp = employeeMap.get(employeeId)!;
      const status = i === 0 ? 'APPLIED' : 'APPROVED';

      // Pick a different designation
      const toDesignation = designations.find((d) => d.id !== emp.designationId) || designations[0];
      const fromGrade = grades.find((g) => g.id === emp.gradeId);
      const toGrade = grades.find((g) => g.code > (fromGrade?.code || 'G1')) || grades[grades.length - 1];

      const currentCtc = emp.annualCtc;
      const incrementPercent = randomDecimal(10, 25);
      const newCtc = Math.round(currentCtc * (1 + incrementPercent / 100));

      await prisma.employeePromotion.create({
        data: {
          companyId,
          employeeId,
          fromDesignationId: emp.designationId,
          toDesignationId: toDesignation.id,
          fromGradeId: emp.gradeId,
          toGradeId: toGrade.id,
          currentCtc,
          newCtc,
          incrementPercent,
          effectiveDate: new Date(randomPastDate(randomInt(0, 2))),
          reason: PROMOTION_REASONS[i % PROMOTION_REASONS.length],
          status: status as 'APPLIED' | 'APPROVED',
          approvedBy: 'system-seed',
          approvedAt: new Date(randomPastDate(1)),
          appliedAt: status === 'APPLIED' ? new Date(randomPastDate(1)) : undefined,
        },
      });
      promosCreated++;
      vlog(ctx, MODULE, `Created promotion for ${emp.firstName} (${status})`);
    }

    // ── Manager Delegates ──
    let delegatesCreated = 0;
    if (managerIds.length >= 2) {
      const delegateCount = randomInt(1, 2);
      const delegateManagers = pickRandomN(managerIds, delegateCount);

      for (let i = 0; i < delegateCount; i++) {
        const managerId = delegateManagers[i];
        const delegateId = managerIds.find((m) => m !== managerId) || managerIds[0];
        if (managerId === delegateId) continue;

        const fromDate = new Date(randomPastDate(1));
        const toDate = new Date(fromDate);
        toDate.setDate(toDate.getDate() + randomInt(5, 14));

        await prisma.managerDelegate.create({
          data: {
            companyId,
            managerId,
            delegateId,
            fromDate,
            toDate,
            isActive: toDate > new Date(),
            reason: 'Manager on planned leave — delegating approvals',
          },
        });
        delegatesCreated++;
        vlog(ctx, MODULE, `Created manager delegation`);
      }
    }

    log(MODULE, `Created ${transfersCreated} transfers, ${promosCreated} promotions, ${delegatesCreated} delegations`);
  },
};
