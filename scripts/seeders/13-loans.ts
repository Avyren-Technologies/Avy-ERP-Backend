import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, weightedPick } from './utils';

const MODULE = 'loans';

export const seeder: SeederModule = {
  name: 'Loans',
  order: 13,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap } = ctx;

    // Check existing loan policies
    const policies = await prisma.loanPolicy.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, loanType: true, maxAmount: true, maxTenureMonths: true, interestRate: true },
    });

    if (policies.length === 0) {
      log(MODULE, 'No loan policies found — skipping');
      return;
    }

    // Check existing loans
    const existingLoans = await prisma.loanRecord.count({ where: { companyId } });
    if (existingLoans >= 5) {
      log(MODULE, `Skipping — ${existingLoans} loan records already exist`);
      return;
    }

    const statusWeights = [
      { value: 'ACTIVE' as const, weight: 50 },
      { value: 'CLOSED' as const, weight: 25 },
      { value: 'PENDING' as const, weight: 25 },
    ];

    const loanCount = randomInt(6, 8);
    const loanEmployees = pickRandomN(employeeIds, Math.min(loanCount, employeeIds.length));
    let created = 0;

    for (let i = 0; i < loanCount; i++) {
      const employeeId = loanEmployees[i % loanEmployees.length];
      const emp = employeeMap.get(employeeId);
      const policy = pickRandom(policies);
      const status = weightedPick(statusWeights);

      const maxAmt = policy.maxAmount ? Number(policy.maxAmount) : 500000;
      const amount = Math.round(randomInt(Math.min(50000, maxAmt), maxAmt) / 1000) * 1000;
      const tenure = Math.min(randomInt(6, 36), policy.maxTenureMonths || 36);
      const interestRate = Number(policy.interestRate);

      // Simple EMI calculation
      const monthlyRate = interestRate / 12 / 100;
      let emiAmount: number;
      if (monthlyRate === 0) {
        emiAmount = Math.round(amount / tenure);
      } else {
        emiAmount = Math.round(
          (amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
            (Math.pow(1 + monthlyRate, tenure) - 1),
        );
      }

      // Calculate outstanding based on status
      let outstanding: number;
      if (status === 'CLOSED') {
        outstanding = 0;
      } else if (status === 'PENDING') {
        outstanding = amount;
      } else {
        const paidMonths = randomInt(1, Math.max(1, tenure - 1));
        outstanding = Math.max(0, amount - paidMonths * emiAmount + Math.round(paidMonths * monthlyRate * amount));
        outstanding = Math.min(outstanding, amount);
      }

      const disbursedAt =
        status === 'ACTIVE' || status === 'CLOSED'
          ? new Date(randomPastDate(randomInt(2, 12)))
          : undefined;

      await prisma.loanRecord.create({
        data: {
          companyId,
          employeeId,
          policyId: policy.id,
          loanType: policy.loanType,
          amount,
          tenure,
          emiAmount,
          interestRate,
          outstanding,
          status,
          disbursedAt,
          isSettled: status === 'CLOSED',
          approvedBy: status !== 'PENDING' ? 'system-seed' : undefined,
        },
      });

      created++;
      vlog(
        ctx,
        MODULE,
        `Loan for ${emp?.firstName || employeeId}: ₹${amount.toLocaleString()} (${policy.loanType}, ${status})`,
      );
    }

    log(MODULE, `Created ${created} loan records`);
  },
};
