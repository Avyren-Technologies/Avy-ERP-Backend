import type { SeederModule } from './types';
import { log, vlog } from './types';
import { randomInt, randomPastDate } from './utils';

const MODULE = 'onboarding';

const TEMPLATE_ITEMS = {
  standard: [
    { title: 'Complete personal details', department: 'HR', description: 'Fill in all personal information in the HRMS', dueInDays: 1, isMandatory: true },
    { title: 'Submit ID documents', department: 'HR', description: 'Upload PAN, Aadhaar, and address proof', dueInDays: 3, isMandatory: true },
    { title: 'Bank account verification', department: 'Finance', description: 'Submit bank details and cancelled cheque', dueInDays: 3, isMandatory: true },
    { title: 'IT equipment setup', department: 'IT', description: 'Laptop, email, and VPN configuration', dueInDays: 1, isMandatory: true },
    { title: 'Access card issuance', department: 'Admin', description: 'Collect office access card from admin desk', dueInDays: 1, isMandatory: true },
    { title: 'Policy acknowledgment', department: 'HR', description: 'Read and acknowledge company policies', dueInDays: 7, isMandatory: true },
    { title: 'Meet the team', department: 'Manager', description: 'Team introduction and buddy assignment', dueInDays: 2, isMandatory: false },
    { title: 'Safety briefing', department: 'Admin', description: 'Complete workplace safety orientation', dueInDays: 5, isMandatory: true },
  ],
  technical: [
    { title: 'Development environment setup', department: 'IT', description: 'Set up IDE, repos, and CI/CD access', dueInDays: 2, isMandatory: true },
    { title: 'Code review guidelines', department: 'Engineering', description: 'Review coding standards and PR process', dueInDays: 3, isMandatory: true },
    { title: 'Architecture overview', department: 'Engineering', description: 'Walkthrough of system architecture', dueInDays: 5, isMandatory: true },
    { title: 'First ticket assignment', department: 'Manager', description: 'Pick up first task from sprint board', dueInDays: 7, isMandatory: false },
    { title: 'Security training', department: 'IT', description: 'Complete security awareness training module', dueInDays: 7, isMandatory: true },
    { title: 'Submit ID documents', department: 'HR', description: 'Upload PAN, Aadhaar, and address proof', dueInDays: 3, isMandatory: true },
  ],
};

export const seeder: SeederModule = {
  name: 'Onboarding',
  order: 16,
  seed: async (ctx) => {
    const { prisma, companyId, employeeIds, employeeMap } = ctx;

    // Check existing templates
    const existingTemplates = await prisma.onboardingTemplate.count({ where: { companyId } });
    if (existingTemplates >= 2) {
      log(MODULE, `Skipping — ${existingTemplates} onboarding templates already exist`);
      return;
    }

    // Create 2 templates
    const standardTemplate = await prisma.onboardingTemplate.create({
      data: {
        companyId,
        name: 'Standard Onboarding',
        items: TEMPLATE_ITEMS.standard,
        isDefault: true,
      },
    });
    vlog(ctx, MODULE, 'Created Standard Onboarding template');

    const techTemplate = await prisma.onboardingTemplate.create({
      data: {
        companyId,
        name: 'Technical Onboarding',
        items: TEMPLATE_ITEMS.technical,
        isDefault: false,
      },
    });
    vlog(ctx, MODULE, 'Created Technical Onboarding template');

    // Find recent joiners (joined in last 2 months)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0];

    const recentJoiners: string[] = [];
    for (const [empId, emp] of employeeMap) {
      if (emp.joiningDate >= twoMonthsAgoStr) {
        recentJoiners.push(empId);
      }
    }

    // If no recent joiners, pick first 3 employees
    const targetEmployees = recentJoiners.length > 0 ? recentJoiners.slice(0, 5) : employeeIds.slice(0, 3);
    let tasksCreated = 0;

    for (const empId of targetEmployees) {
      const emp = employeeMap.get(empId);
      const template = Math.random() > 0.5 ? techTemplate : standardTemplate;
      const items = template.id === techTemplate.id ? TEMPLATE_ITEMS.technical : TEMPLATE_ITEMS.standard;
      const joiningDate = emp?.joiningDate ? new Date(emp.joiningDate) : new Date();

      for (const item of items) {
        const dueDate = new Date(joiningDate);
        dueDate.setDate(dueDate.getDate() + item.dueInDays);

        // Determine task status based on how long ago they joined
        const daysSinceJoin = Math.floor(
          (Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        let status = 'PENDING';
        let completedAt: Date | undefined;

        if (daysSinceJoin > item.dueInDays + 5) {
          status = 'COMPLETED';
          completedAt = new Date(joiningDate);
          completedAt.setDate(completedAt.getDate() + item.dueInDays + randomInt(0, 2));
        } else if (daysSinceJoin > item.dueInDays) {
          status = Math.random() > 0.3 ? 'COMPLETED' : 'IN_PROGRESS';
          if (status === 'COMPLETED') {
            completedAt = new Date(joiningDate);
            completedAt.setDate(completedAt.getDate() + item.dueInDays);
          }
        } else if (daysSinceJoin > 1) {
          status = Math.random() > 0.5 ? 'IN_PROGRESS' : 'PENDING';
        }

        await prisma.onboardingTask.create({
          data: {
            companyId,
            employeeId: empId,
            templateId: template.id,
            title: item.title,
            department: item.department,
            description: item.description,
            dueDate,
            isMandatory: item.isMandatory,
            status,
            completedAt,
            completedBy: completedAt ? 'system-seed' : undefined,
          },
        });
        tasksCreated++;
      }

      vlog(ctx, MODULE, `Created ${items.length} tasks for ${emp?.firstName || empId}`);
    }

    // Create probation reviews for employees with PROBATION status
    const probationEmployees: string[] = [];
    for (const [empId, emp] of employeeMap) {
      if (emp.status === 'PROBATION') {
        probationEmployees.push(empId);
      }
    }

    let reviewsCreated = 0;
    for (const empId of probationEmployees.slice(0, 5)) {
      const emp = employeeMap.get(empId)!;
      const joiningDate = new Date(emp.joiningDate);
      const probationEnd = new Date(joiningDate);
      probationEnd.setMonth(probationEnd.getMonth() + 6); // 6-month probation

      const reviewDate = new Date(probationEnd);
      reviewDate.setDate(reviewDate.getDate() - 15); // Review 15 days before end

      // Check for unique constraint
      const exists = await prisma.probationReview.findUnique({
        where: {
          employeeId_probationEndDate: {
            employeeId: empId,
            probationEndDate: probationEnd,
          },
        },
      });
      if (exists) continue;

      await prisma.probationReview.create({
        data: {
          companyId,
          employeeId: empId,
          reviewDate,
          probationEndDate: probationEnd,
          decision: 'PENDING',
          performanceRating: randomInt(3, 5),
          managerFeedback: 'Employee has shown good progress during probation period.',
        },
      });
      reviewsCreated++;
      vlog(ctx, MODULE, `Created probation review for ${emp.firstName}`);
    }

    log(MODULE, `Created 2 templates, ${tasksCreated} onboarding tasks, ${reviewsCreated} probation reviews`);
  },
};
