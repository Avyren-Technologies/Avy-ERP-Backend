import type { SeederModule } from './types';
import { log, vlog } from './types';

const MODULE = 'policies';

const POLICY_DEFS: { title: string; category: string; description: string; fileName: string }[] = [
  {
    title: 'Annual Leave Policy',
    category: 'LEAVE_POLICY',
    description: 'Comprehensive leave policy covering all leave types, accrual rules, and approval processes.',
    fileName: 'leave-policy-v1.0.pdf',
  },
  {
    title: 'Code of Conduct',
    category: 'CODE_OF_CONDUCT',
    description: 'Standards of professional behaviour, ethics, and workplace expectations for all employees.',
    fileName: 'code-of-conduct-v1.0.pdf',
  },
  {
    title: 'Work From Home Policy',
    category: 'HR_POLICY',
    description: 'Guidelines for remote work eligibility, expectations, and reporting requirements.',
    fileName: 'wfh-policy-v1.0.pdf',
  },
  {
    title: 'Anti-Harassment & POSH Policy',
    category: 'HR_POLICY',
    description: 'Policy on prevention of sexual harassment at workplace as per POSH Act 2013.',
    fileName: 'posh-policy-v1.0.pdf',
  },
  {
    title: 'Data Privacy & Information Security Policy',
    category: 'IT_POLICY',
    description: 'Guidelines for handling confidential data, GDPR/DPDP compliance, and device security.',
    fileName: 'data-privacy-policy-v1.0.pdf',
  },
  {
    title: 'Dress Code Policy',
    category: 'HR_POLICY',
    description: 'Office dress code standards and guidelines for business casual and formal occasions.',
    fileName: 'dress-code-policy-v1.0.pdf',
  },
  {
    title: 'Travel & Expense Reimbursement Policy',
    category: 'TRAVEL',
    description: 'Rules for business travel, eligible expenses, reimbursement limits, and claim procedures.',
    fileName: 'travel-policy-v1.0.pdf',
  },
  {
    title: 'Attendance & Punctuality Policy',
    category: 'ATTENDANCE_POLICY',
    description: 'Attendance expectations, late-coming rules, and regularization procedures.',
    fileName: 'attendance-policy-v1.0.pdf',
  },
];

export const seeder: SeederModule = {
  name: 'Policies',
  order: 20,
  seed: async (ctx) => {
    const { prisma, companyId } = ctx;

    // Check existing policy documents
    const existingPolicies = await prisma.policyDocument.count({ where: { companyId } });
    if (existingPolicies >= 5) {
      log(MODULE, `Skipping — ${existingPolicies} policy documents already exist`);
      return;
    }

    let created = 0;

    for (const def of POLICY_DEFS) {
      await prisma.policyDocument.create({
        data: {
          companyId,
          title: def.title,
          category: def.category,
          description: def.description,
          fileUrl: `/policies/${def.fileName}`,
          fileName: def.fileName,
          version: '1.0',
          isActive: true,
          publishedAt: new Date(),
          uploadedBy: 'system-seed',
        },
      });
      created++;
      vlog(ctx, MODULE, `Created policy: ${def.title}`);
    }

    log(MODULE, `Created ${created} policy documents`);
  },
};
