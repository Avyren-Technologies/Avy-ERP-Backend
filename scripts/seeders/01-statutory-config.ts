import type { SeederModule } from './types';
import { log, vlog } from './types';

const MODULE = 'statutory-config';

export const seeder: SeederModule = {
  name: 'Statutory Config',
  order: 1,
  seed: async (ctx) => {
    const { prisma, companyId } = ctx;

    // -- PF Config --
    await prisma.pFConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        employeeRate: 12,
        employerEpfRate: 3.67,
        employerEpsRate: 8.33,
        employerEdliRate: 0.5,
        adminChargeRate: 0.5,
        wageCeiling: 15000,
        vpfEnabled: false,
      },
    });
    vlog(ctx, MODULE, 'PF config created');

    // -- ESI Config --
    await prisma.eSIConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        employeeRate: 0.75,
        employerRate: 3.25,
        wageCeiling: 21000,
      },
    });
    vlog(ctx, MODULE, 'ESI config created');

    // -- PT Config (Karnataka) --
    await prisma.pTConfig.upsert({
      where: { companyId_state: { companyId, state: 'Karnataka' } },
      update: {},
      create: {
        companyId,
        state: 'Karnataka',
        frequency: 'MONTHLY',
        financialYear: '2025-26',
        slabs: [
          { fromAmount: 0, toAmount: 15000, taxAmount: 0 },
          { fromAmount: 15001, toAmount: 25000, taxAmount: 150 },
          { fromAmount: 25001, toAmount: 999999999, taxAmount: 200 },
        ],
        monthlyOverrides: { '2': 300 }, // February higher slab
      },
    });
    vlog(ctx, MODULE, 'PT config (Karnataka) created');

    // -- Tax Config --
    await prisma.taxConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        defaultRegime: 'NEW',
        cessRate: 4,
        oldRegimeSlabs: [
          { fromAmount: 0, toAmount: 250000, rate: 0 },
          { fromAmount: 250001, toAmount: 500000, rate: 5 },
          { fromAmount: 500001, toAmount: 1000000, rate: 20 },
          { fromAmount: 1000001, toAmount: 999999999, rate: 30 },
        ],
        newRegimeSlabs: [
          { fromAmount: 0, toAmount: 300000, rate: 0 },
          { fromAmount: 300001, toAmount: 700000, rate: 5 },
          { fromAmount: 700001, toAmount: 1000000, rate: 10 },
          { fromAmount: 1000001, toAmount: 1200000, rate: 15 },
          { fromAmount: 1200001, toAmount: 1500000, rate: 20 },
          { fromAmount: 1500001, toAmount: 999999999, rate: 30 },
        ],
        surchargeRates: [
          { threshold: 5000000, rate: 10 },
          { threshold: 10000000, rate: 15 },
        ],
      },
    });
    vlog(ctx, MODULE, 'Tax config created');

    // -- Gratuity Config --
    await prisma.gratuityConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        formula: '(lastBasic * 15 * yearsOfService) / 26',
        baseSalary: 'Basic',
        maxAmount: 2000000,
        provisionMethod: 'MONTHLY',
        trustExists: false,
      },
    });
    vlog(ctx, MODULE, 'Gratuity config created');

    // -- Bonus Config --
    await prisma.bonusConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        minBonusPercent: 8.33,
        maxBonusPercent: 20,
        wageCeiling: 21000,
        eligibilityDays: 30,
        calculationPeriod: 'APR_MAR',
      },
    });
    vlog(ctx, MODULE, 'Bonus config created');

    // -- Bank Config --
    await prisma.bankConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        bankName: 'State Bank of India',
        ifscCode: 'SBIN0001234',
        accountNumber: '39201234567890',
        branchName: 'MG Road, Bangalore',
        paymentMode: 'NEFT',
        autoPushOnApproval: false,
      },
    });
    vlog(ctx, MODULE, 'Bank config created');

    log(MODULE, 'All statutory configs seeded (PF, ESI, PT, Tax, Gratuity, Bonus, Bank)');
  },
};
