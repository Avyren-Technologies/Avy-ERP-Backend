import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, randomDecimal, weightedPick } from './utils';

const MODULE = 'expenses';

const CLAIM_TITLES = [
  'Client visit travel reimbursement',
  'Team lunch expense',
  'Conference registration fee',
  'Cab fare to office',
  'Internet bill reimbursement',
  'Office supplies purchase',
  'Medical check-up expenses',
  'Business dinner with vendor',
  'Training course material',
  'Software subscription renewal',
  'Hotel accommodation for site visit',
  'Fuel reimbursement',
  'Courier charges',
  'Stationery purchase',
  'Mobile phone bill reimbursement',
  'Flight tickets for client meeting',
  'Parking charges',
  'Toll charges reimbursement',
];

const ITEM_DESCRIPTIONS: Record<string, string[]> = {
  TRAVEL: ['Cab fare', 'Auto rickshaw', 'Metro pass', 'Bus ticket', 'Train ticket', 'Flight ticket', 'Toll charges'],
  FOOD: ['Team lunch', 'Business dinner', 'Coffee meeting', 'Working lunch', 'Client lunch'],
  ACCOMMODATION: ['Hotel stay', 'Guest house', 'Service apartment'],
  FUEL: ['Petrol reimbursement', 'Diesel reimbursement', 'CNG refill'],
  PHONE: ['Monthly phone bill', 'Data pack', 'International roaming'],
  INTERNET: ['Broadband bill', 'Dongle recharge', 'WiFi subscription'],
  OFFICE_SUPPLIES: ['Printer cartridge', 'Notepad & pens', 'Whiteboard markers', 'USB drives'],
  MEDICAL: ['Health check-up', 'Eye test', 'Dental visit'],
  OTHER: ['Courier charges', 'Parking', 'Miscellaneous expense'],
};

export const seeder: SeederModule = {
  name: 'Expenses',
  order: 12,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds } = ctx;

    // Check existing expense categories
    const categories = await prisma.expenseCategory.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true },
    });

    if (categories.length === 0) {
      log(MODULE, 'No expense categories found — skipping');
      return;
    }

    // Check existing claims
    const existingClaims = await prisma.expenseClaim.count({ where: { companyId } });
    if (existingClaims >= 10) {
      log(MODULE, `Skipping — ${existingClaims} expense claims already exist`);
      return;
    }

    const categoryByCode = new Map(categories.map((c) => [c.code, c]));
    const categoryCodes = categories.map((c) => c.code);

    const statusWeights = [
      { value: 'APPROVED' as const, weight: 40 },
      { value: 'PENDING_APPROVAL' as const, weight: 30 },
      { value: 'REJECTED' as const, weight: 15 },
      { value: 'PAID' as const, weight: 15 },
    ];

    const paymentMethods = ['CASH', 'PERSONAL_CARD', 'UPI', 'BANK_TRANSFER'] as const;

    // Create 15-20 expense claims
    const claimCount = randomInt(15, 20);
    const claimEmployees = pickRandomN(employeeIds, Math.min(claimCount, employeeIds.length));
    let totalClaims = 0;
    let totalItems = 0;

    for (let i = 0; i < claimCount; i++) {
      const employeeId = claimEmployees[i % claimEmployees.length];
      const status = weightedPick(statusWeights);
      const tripDate = randomPastDate(randomInt(1, 4));
      const primaryCode = pickRandom(categoryCodes);
      const primaryCat = categoryByCode.get(primaryCode)!;

      // Create 2-4 line items
      const itemCount = randomInt(2, 4);
      const items: {
        categoryId: string;
        categoryCode: string;
        description: string;
        amount: number;
        expenseDate: Date;
        merchantName: string | undefined;
        isApproved: boolean | undefined;
        approvedAmount: number | undefined;
      }[] = [];

      let totalAmount = 0;

      for (let j = 0; j < itemCount; j++) {
        const itemCode = j === 0 ? primaryCode : pickRandom(categoryCodes);
        const itemCat = categoryByCode.get(itemCode) || primaryCat;
        const descs = ITEM_DESCRIPTIONS[itemCode] || ITEM_DESCRIPTIONS['OTHER'];
        const amount = randomDecimal(200, 8000);
        totalAmount += amount;

        items.push({
          categoryId: itemCat.id,
          categoryCode: itemCode,
          description: pickRandom(descs),
          amount,
          expenseDate: new Date(tripDate),
          merchantName: j === 0 ? 'Various vendors' : undefined,
          isApproved: status === 'APPROVED' || status === 'PAID' ? true : status === 'REJECTED' ? false : undefined,
          approvedAmount: status === 'APPROVED' || status === 'PAID' ? amount : undefined,
        });
      }

      const claim = await prisma.expenseClaim.create({
        data: {
          companyId,
          employeeId,
          title: pickRandom(CLAIM_TITLES),
          amount: totalAmount,
          category: primaryCode,
          description: `Expense claim for ${primaryCat.name.toLowerCase()}`,
          tripDate: new Date(tripDate),
          paymentMethod: pickRandom([...paymentMethods]),
          currency: 'INR',
          status,
          claimNumber: `EXP-${String(i + 1).padStart(5, '0')}`,
          approvedAmount: status === 'APPROVED' || status === 'PAID' ? totalAmount : undefined,
          approvedAt: status === 'APPROVED' || status === 'PAID' ? new Date(randomPastDate(1)) : undefined,
          paidAt: status === 'PAID' ? new Date(randomPastDate(1)) : undefined,
          items: {
            create: items,
          },
        },
      });

      totalClaims++;
      totalItems += itemCount;
      vlog(ctx, MODULE, `Created claim ${claim.claimNumber} (${status}) with ${itemCount} items`);
    }

    log(MODULE, `Created ${totalClaims} expense claims with ${totalItems} line items`);
  },
};
