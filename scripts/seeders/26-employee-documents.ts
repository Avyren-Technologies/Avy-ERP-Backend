import type { SeederModule } from './types';
import { log, vlog } from './types';
import { fakePAN, fakeAadhaar, randomDigits } from './utils';

const MODULE = 'employee-documents';

const DOCUMENT_TYPES: Array<{
  type: string;
  genNumber: () => string;
  hasExpiry: boolean;
}> = [
  { type: 'PAN Card', genNumber: fakePAN, hasExpiry: false },
  { type: 'Aadhaar Card', genNumber: fakeAadhaar, hasExpiry: false },
  {
    type: 'Passport',
    genNumber: () => `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${randomDigits(7)}`,
    hasExpiry: true,
  },
];

export const seeder: SeederModule = {
  name: 'Employee Documents',
  order: 26,
  seed: async (ctx) => {
    const { prisma, employeeIds, employeeMap } = ctx;

    // Check existing
    const existing = await prisma.employeeDocument.count();
    if (existing >= employeeIds.length * 2) {
      log(MODULE, `Skipping — ${existing} employee documents already exist`);
      return;
    }

    let created = 0;

    for (const employeeId of employeeIds) {
      const emp = employeeMap.get(employeeId);
      const firstName = emp?.firstName || 'Employee';
      const lastName = emp?.lastName || 'User';

      // Create 2-3 documents per employee
      const docCount = 2 + (Math.random() > 0.5 ? 1 : 0);

      for (let i = 0; i < docCount && i < DOCUMENT_TYPES.length; i++) {
        const docType = DOCUMENT_TYPES[i];
        const docNumber = docType.genNumber();

        // Build a placeholder filename
        const fileName = `${firstName}_${lastName}_${docType.type.replace(/\s+/g, '_')}.pdf`;
        const fileUrl = `/uploads/documents/${employeeId}/${fileName}`;

        let expiryDate: Date | undefined;
        if (docType.hasExpiry) {
          // Passport expiry 5-10 years from now
          const yearsAhead = 5 + Math.floor(Math.random() * 6);
          expiryDate = new Date(new Date().getFullYear() + yearsAhead, Math.floor(Math.random() * 12), 15);
        }

        await prisma.employeeDocument.create({
          data: {
            employeeId,
            documentType: docType.type,
            documentNumber: docNumber,
            expiryDate: expiryDate || null,
            fileUrl,
            fileName,
          },
        });
        created++;
      }

      vlog(ctx, MODULE, `${firstName} ${lastName}: ${docCount} documents`);
    }

    log(MODULE, `Created ${created} employee document records`);
  },
};
