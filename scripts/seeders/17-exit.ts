import type { SeederModule } from './types';
import { log, vlog } from './types';
import { randomInt, randomPastDate } from './utils';

const MODULE = 'exit';

const EXIT_INTERVIEW_QUESTIONS = [
  { question: 'What is your primary reason for leaving?', answer: '' },
  { question: 'How was your relationship with your manager?', answer: '' },
  { question: 'Were there adequate growth opportunities?', answer: '' },
  { question: 'How would you rate the work-life balance?', answer: '' },
  { question: 'What could the company improve?', answer: '' },
  { question: 'Would you consider returning in the future?', answer: '' },
];

const CLEARANCE_DEPARTMENTS = [
  {
    department: 'IT',
    items: [
      { item: 'Laptop returned', status: 'PENDING', notes: null },
      { item: 'Email account deactivated', status: 'PENDING', notes: null },
      { item: 'VPN access revoked', status: 'PENDING', notes: null },
      { item: 'Software licenses transferred', status: 'PENDING', notes: null },
    ],
  },
  {
    department: 'Admin',
    items: [
      { item: 'Access card returned', status: 'PENDING', notes: null },
      { item: 'Parking card returned', status: 'PENDING', notes: null },
      { item: 'Desk/locker cleared', status: 'PENDING', notes: null },
    ],
  },
  {
    department: 'Finance',
    items: [
      { item: 'Pending reimbursements settled', status: 'PENDING', notes: null },
      { item: 'Salary advances recovered', status: 'PENDING', notes: null },
      { item: 'Company credit card surrendered', status: 'PENDING', notes: null },
    ],
  },
  {
    department: 'HR',
    items: [
      { item: 'Exit interview completed', status: 'PENDING', notes: null },
      { item: 'Knowledge transfer done', status: 'PENDING', notes: null },
      { item: 'Relieving letter prepared', status: 'PENDING', notes: null },
    ],
  },
];

export const seeder: SeederModule = {
  name: 'Exit',
  order: 17,
  seed: async (ctx) => {
    const { prisma, companyId, employeeMap } = ctx;

    // Check existing exit requests
    const existingExits = await prisma.exitRequest.count({ where: { companyId } });
    if (existingExits >= 2) {
      log(MODULE, `Skipping — ${existingExits} exit requests already exist`);
      return;
    }

    // Find ON_NOTICE and SEPARATED employees
    const onNoticeEmployees: string[] = [];
    const separatedEmployees: string[] = [];

    for (const [empId, emp] of employeeMap) {
      if (emp.status === 'ON_NOTICE') onNoticeEmployees.push(empId);
      if (emp.status === 'SEPARATED') separatedEmployees.push(empId);
    }

    // If no matching employees, use last 2-3 employees as mock separations
    const exitEmployees = [
      ...onNoticeEmployees.slice(0, 2),
      ...separatedEmployees.slice(0, 1),
    ];

    if (exitEmployees.length === 0) {
      log(MODULE, 'No ON_NOTICE or SEPARATED employees — skipping exit seeding');
      return;
    }

    let requestsCreated = 0;
    let clearancesCreated = 0;
    let interviewsCreated = 0;
    let fnfCreated = 0;

    for (let i = 0; i < exitEmployees.length; i++) {
      const employeeId = exitEmployees[i];
      const emp = employeeMap.get(employeeId)!;
      const isCompleted = emp.status === 'SEPARATED';
      const isOnNotice = emp.status === 'ON_NOTICE';

      const resignationDate = randomPastDate(randomInt(1, 3));
      const lastWorkingDate = new Date(resignationDate);
      lastWorkingDate.setDate(lastWorkingDate.getDate() + 90); // 90-day notice

      const exitStatus = isCompleted ? 'COMPLETED' : isOnNotice ? 'NOTICE_PERIOD' : 'CLEARANCE_PENDING';

      const exitRequest = await prisma.exitRequest.create({
        data: {
          companyId,
          employeeId,
          exitNumber: `OFF-${String(i + 1).padStart(5, '0')}`,
          separationType: isCompleted ? 'VOLUNTARY_RESIGNATION' : 'VOLUNTARY_RESIGNATION',
          resignationDate: new Date(resignationDate),
          lastWorkingDate,
          noticePeriodDays: 90,
          noticePeriodWaiver: false,
          exitInterviewDone: isCompleted,
          knowledgeTransferDone: isCompleted,
          status: exitStatus as 'INITIATED' | 'NOTICE_PERIOD' | 'CLEARANCE_PENDING' | 'COMPLETED',
          initiatedBy: employeeId,
        },
      });
      requestsCreated++;
      vlog(ctx, MODULE, `Created exit request for ${emp.firstName} (${exitStatus})`);

      // Create clearance records
      for (const dept of CLEARANCE_DEPARTMENTS) {
        const clearedItems = dept.items.map((item) => ({
          ...item,
          status: isCompleted ? 'CLEARED' : Math.random() > 0.5 ? 'CLEARED' : 'PENDING',
        }));

        const allCleared = clearedItems.every((item) => item.status === 'CLEARED');

        await prisma.exitClearance.create({
          data: {
            companyId,
            exitRequestId: exitRequest.id,
            department: dept.department,
            items: clearedItems,
            status: allCleared ? 'CLEARED' : 'PENDING',
            clearedBy: allCleared ? 'system-seed' : undefined,
            clearedAt: allCleared ? new Date() : undefined,
          },
        });
        clearancesCreated++;
      }

      // Create exit interview for completed/on-notice exits
      if (isCompleted || (isOnNotice && Math.random() > 0.5)) {
        const answers = [
          'Better career growth opportunities',
          'Good — my manager was supportive and understanding',
          'Limited opportunities in current role',
          'Work-life balance was generally good',
          'More transparent promotion process and salary revisions',
          'Yes, if the right opportunity arises',
        ];

        const responses = EXIT_INTERVIEW_QUESTIONS.map((q, idx) => ({
          question: q.question,
          answer: answers[idx],
        }));

        await prisma.exitInterview.create({
          data: {
            companyId,
            exitRequestId: exitRequest.id,
            responses,
            conductedBy: 'system-seed',
            conductedAt: new Date(randomPastDate(1)),
            overallRating: randomInt(3, 5),
            wouldRecommend: Math.random() > 0.3,
          },
        });
        interviewsCreated++;
      }

      // Create F&F settlement for completed exits
      if (isCompleted) {
        const monthlySalary = emp.annualCtc / 12;
        const workedDaysPay = Math.round(monthlySalary * 0.7); // partial month
        const leaveEncashment = Math.round(monthlySalary * 0.3);
        const gratuity = emp.annualCtc > 500000 ? Math.round((monthlySalary * 0.4 * 15) / 26) : 0;
        const noticePay = 0;
        const totalAmount = workedDaysPay + leaveEncashment + gratuity + noticePay;

        await prisma.fnFSettlement.create({
          data: {
            companyId,
            exitRequestId: exitRequest.id,
            employeeId,
            salaryForWorkedDays: workedDaysPay,
            leaveEncashment,
            gratuityAmount: gratuity,
            bonusProRata: Math.round(monthlySalary * 0.08),
            noticePay,
            loanRecovery: 0,
            assetRecovery: 0,
            reimbursementPending: 0,
            tdsOnFnF: Math.round(totalAmount * 0.1),
            otherDeductions: 0,
            otherEarnings: 0,
            totalAmount,
            components: {
              earnings: { workedDaysPay, leaveEncashment, gratuity, bonusProRata: Math.round(monthlySalary * 0.08) },
              deductions: { tds: Math.round(totalAmount * 0.1), loanRecovery: 0, assetRecovery: 0 },
            },
            status: 'PAID',
            approvedBy: 'system-seed',
            approvedAt: new Date(randomPastDate(1)),
            paidAt: new Date(),
          },
        });
        fnfCreated++;
      }
    }

    log(
      MODULE,
      `Created ${requestsCreated} exit requests, ${clearancesCreated} clearances, ${interviewsCreated} interviews, ${fnfCreated} F&F settlements`,
    );
  },
};
