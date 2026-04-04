import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, pickRandomN, randomInt, randomPastDate, weightedPick } from './utils';

const MODULE = 'letters';

const TEMPLATE_DEFS: { type: string; name: string; body: string }[] = [
  {
    type: 'OFFER',
    name: 'Standard Offer Letter',
    body: `Dear {employee_name},

We are pleased to offer you the position of {designation} at {company_name}. Your annual CTC will be {ctc_amount}. Your start date is {joining_date}.

Please confirm your acceptance by signing and returning this letter.

Best regards,
HR Department`,
  },
  {
    type: 'APPOINTMENT',
    name: 'Appointment Letter',
    body: `Dear {employee_name},

This letter confirms your appointment as {designation} in the {department} department, effective {effective_date}. Your Employee ID is {employee_id}.

We look forward to your contributions to {company_name}.

Regards,
HR Department`,
  },
  {
    type: 'CONFIRMATION',
    name: 'Probation Confirmation Letter',
    body: `Dear {employee_name},

We are pleased to confirm your services as {designation} at {company_name} with effect from {effective_date}. Your probation period has been successfully completed.

Congratulations and best wishes for your future with us.

Regards,
HR Department`,
  },
  {
    type: 'PROMOTION',
    name: 'Promotion Letter',
    body: `Dear {employee_name},

We are delighted to inform you of your promotion to the position of {designation}, effective {effective_date}. This promotion is in recognition of your outstanding performance and contributions.

Your revised annual CTC will be {ctc_amount}.

Congratulations!
HR Department`,
  },
  {
    type: 'RELIEVING',
    name: 'Relieving Letter',
    body: `Dear {employee_name},

This is to certify that {employee_name} was employed with {company_name} as {designation} from {joining_date} to {effective_date}. They have been relieved from their duties as of {effective_date}.

We wish them all the best in their future endeavours.

Regards,
HR Department`,
  },
];

export const seeder: SeederModule = {
  name: 'Letters',
  order: 14,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap } = ctx;

    // Check existing templates
    const existingTemplates = await prisma.hRLetterTemplate.count({ where: { companyId } });
    if (existingTemplates >= 5) {
      log(MODULE, `Skipping — ${existingTemplates} letter templates already exist`);
      return;
    }

    // Create templates
    const templates: { id: string; type: string }[] = [];
    for (const def of TEMPLATE_DEFS) {
      const template = await prisma.hRLetterTemplate.create({
        data: {
          companyId,
          type: def.type,
          name: def.name,
          bodyTemplate: def.body,
          isActive: true,
        },
      });
      templates.push({ id: template.id, type: def.type });
      vlog(ctx, MODULE, `Created template: ${def.name}`);
    }

    // Create 10-15 HR letters for employees
    const letterCount = randomInt(10, 15);
    const letterEmployees = pickRandomN(employeeIds, Math.min(letterCount, employeeIds.length));

    const signStatuses = [
      { value: 'SIGNED', weight: 60 },
      { value: 'PENDING', weight: 30 },
      { value: undefined, weight: 10 },
    ];

    let created = 0;
    for (let i = 0; i < letterCount; i++) {
      const employeeId = letterEmployees[i % letterEmployees.length];
      const emp = employeeMap.get(employeeId);
      const template = pickRandom(templates);
      const effectiveDate = randomPastDate(randomInt(1, 12));
      const eSignStatus = weightedPick(signStatuses);

      await prisma.hRLetter.create({
        data: {
          companyId,
          templateId: template.id,
          employeeId,
          letterNumber: `LTR-${String(i + 1).padStart(5, '0')}`,
          effectiveDate: new Date(effectiveDate),
          eSignStatus: eSignStatus || undefined,
          eSignedAt: eSignStatus === 'SIGNED' ? new Date(randomPastDate(1)) : undefined,
          eSignDispatchedAt: eSignStatus ? new Date(effectiveDate) : undefined,
        },
      });

      created++;
      vlog(ctx, MODULE, `Created ${template.type} letter for ${emp?.firstName || employeeId}`);
    }

    log(MODULE, `Created ${templates.length} templates, ${created} letters`);
  },
};
