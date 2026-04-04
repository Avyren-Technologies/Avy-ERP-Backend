import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, todayISO } from './utils';

const MODULE = 'assets';

const ASSET_DEFS: { name: string; serial: string; condition: string }[] = [
  // Laptops
  { name: 'Dell Latitude 5540', serial: 'DL5540', condition: 'NEW' },
  { name: 'Dell Latitude 7440', serial: 'DL7440', condition: 'NEW' },
  { name: 'HP EliteBook 840 G10', serial: 'HP840G10', condition: 'LIKE_NEW' },
  { name: 'HP ProBook 450 G9', serial: 'HP450G9', condition: 'GOOD' },
  { name: 'Lenovo ThinkPad T14', serial: 'LTP14', condition: 'NEW' },
  { name: 'Lenovo ThinkPad X1 Carbon', serial: 'LTX1C', condition: 'LIKE_NEW' },
  { name: 'MacBook Pro 14" M3', serial: 'MBP14M3', condition: 'NEW' },
  { name: 'MacBook Air 13" M2', serial: 'MBA13M2', condition: 'NEW' },
  // Phones
  { name: 'iPhone 15', serial: 'IP15', condition: 'NEW' },
  { name: 'iPhone 14', serial: 'IP14', condition: 'GOOD' },
  { name: 'Samsung Galaxy S24', serial: 'SGS24', condition: 'NEW' },
  { name: 'Samsung Galaxy A54', serial: 'SGA54', condition: 'LIKE_NEW' },
  { name: 'OnePlus 12', serial: 'OP12', condition: 'NEW' },
  // Access Cards
  { name: 'HID Access Card', serial: 'HID', condition: 'NEW' },
  { name: 'HID Access Card', serial: 'HID', condition: 'NEW' },
  { name: 'HID Access Card', serial: 'HID', condition: 'NEW' },
  { name: 'HID Access Card', serial: 'HID', condition: 'NEW' },
  { name: 'HID Access Card', serial: 'HID', condition: 'NEW' },
  // Monitors
  { name: 'Dell U2723QE 27" 4K Monitor', serial: 'DU27', condition: 'NEW' },
  { name: 'LG 27UK850 4K Monitor', serial: 'LG27', condition: 'GOOD' },
  { name: 'Samsung 32" Curved Monitor', serial: 'SS32', condition: 'LIKE_NEW' },
  // Peripherals
  { name: 'Logitech MX Keys Keyboard', serial: 'LMXK', condition: 'NEW' },
  { name: 'Logitech MX Master 3S Mouse', serial: 'LMX3', condition: 'NEW' },
  { name: 'Jabra Evolve2 75 Headset', serial: 'JE275', condition: 'LIKE_NEW' },
  { name: 'Poly Voyager Focus 2', serial: 'PVF2', condition: 'NEW' },
];

export const seeder: SeederModule = {
  name: 'Assets',
  order: 11,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds } = ctx;

    // Check existing asset categories
    const categories = await prisma.assetCategory.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    if (categories.length === 0) {
      log(MODULE, 'No asset categories found — skipping asset seeding');
      return;
    }

    const categoryMap = new Map(categories.map((c) => [c.name, c.id]));

    // Check existing assets
    const existingAssets = await prisma.asset.count({ where: { companyId } });
    if (existingAssets >= 20) {
      log(MODULE, `Skipping — ${existingAssets} assets already exist`);
      return;
    }

    // Assign category based on name
    const getCategoryId = (assetName: string): string => {
      if (assetName.includes('Laptop') || assetName.includes('Book') || assetName.includes('Mac'))
        return categoryMap.get('Laptops') || categoryMap.get('IT Equipment') || categories[0].id;
      if (assetName.includes('Phone') || assetName.includes('iPhone') || assetName.includes('Galaxy') || assetName.includes('OnePlus'))
        return categoryMap.get('Mobile Devices') || categoryMap.get('IT Equipment') || categories[0].id;
      if (assetName.includes('Access Card'))
        return categoryMap.get('Access Cards') || categoryMap.get('Office Equipment') || categories[0].id;
      if (assetName.includes('Monitor'))
        return categoryMap.get('Monitors') || categoryMap.get('IT Equipment') || categories[0].id;
      return categoryMap.get('Office Equipment') || categories[0].id;
    };

    // Create assets
    const createdAssets: { id: string; name: string }[] = [];
    for (let i = 0; i < ASSET_DEFS.length; i++) {
      const def = ASSET_DEFS[i];
      const asset = await prisma.asset.create({
        data: {
          companyId,
          name: def.name,
          categoryId: getCategoryId(def.name),
          serialNumber: `${def.serial}-${String(i + 1).padStart(4, '0')}`,
          assetNumber: `AST-${String(i + 1).padStart(5, '0')}`,
          purchaseDate: new Date(randomPastDate(randomInt(1, 18))),
          purchaseValue: randomInt(5000, 150000),
          condition: def.condition as 'NEW' | 'LIKE_NEW' | 'GOOD',
          status: 'IN_STOCK',
        },
      });
      createdAssets.push({ id: asset.id, name: asset.name });
      vlog(ctx, MODULE, `Created asset: ${def.name}`);
    }

    // Assign ~60% of employees
    const assignableAssets = createdAssets.filter((_, i) => ASSET_DEFS[i].name !== 'HID Access Card');
    const assignableEmployees = pickRandomN(employeeIds, Math.floor(employeeIds.length * 0.6));
    const assignmentCount = Math.min(assignableEmployees.length, assignableAssets.length);

    for (let i = 0; i < assignmentCount; i++) {
      const asset = assignableAssets[i];
      const employeeId = assignableEmployees[i];
      const issueDate = randomPastDate(randomInt(1, 12));

      await prisma.assetAssignment.create({
        data: {
          companyId,
          assetId: asset.id,
          employeeId,
          issueDate: new Date(issueDate),
          notes: `Assigned ${asset.name}`,
        },
      });

      // Mark asset as ASSIGNED
      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'ASSIGNED' },
      });
    }

    // Assign access cards to some employees
    const accessCardAssets = createdAssets.filter((_, i) => ASSET_DEFS[i].name === 'HID Access Card');
    const cardEmployees = pickRandomN(employeeIds, accessCardAssets.length);
    for (let i = 0; i < accessCardAssets.length; i++) {
      await prisma.assetAssignment.create({
        data: {
          companyId,
          assetId: accessCardAssets[i].id,
          employeeId: cardEmployees[i],
          issueDate: new Date(randomPastDate(randomInt(1, 6))),
          notes: 'Office access card',
        },
      });
      await prisma.asset.update({
        where: { id: accessCardAssets[i].id },
        data: { status: 'ASSIGNED' },
      });
    }

    log(MODULE, `Created ${createdAssets.length} assets, ${assignmentCount + accessCardAssets.length} assignments`);
  },
};
