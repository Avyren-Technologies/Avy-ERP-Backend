import type { SeederModule } from './types';
import { log, vlog } from './types';
import { pickRandom, randomInt, randomPastDate } from './utils';

const MODULE = 'audit-logs';

const AUDIT_ACTIONS: { action: string; entityType: string }[] = [
  { action: 'LOGIN', entityType: 'User' },
  { action: 'LOGIN', entityType: 'User' },
  { action: 'LOGOUT', entityType: 'User' },
  { action: 'CREATE_EMPLOYEE', entityType: 'Employee' },
  { action: 'CREATE_EMPLOYEE', entityType: 'Employee' },
  { action: 'UPDATE_EMPLOYEE', entityType: 'Employee' },
  { action: 'UPDATE_EMPLOYEE', entityType: 'Employee' },
  { action: 'UPDATE_EMPLOYEE', entityType: 'Employee' },
  { action: 'APPROVE_LEAVE', entityType: 'LeaveRequest' },
  { action: 'APPROVE_LEAVE', entityType: 'LeaveRequest' },
  { action: 'REJECT_LEAVE', entityType: 'LeaveRequest' },
  { action: 'RUN_PAYROLL', entityType: 'PayrollRun' },
  { action: 'APPROVE_PAYROLL', entityType: 'PayrollRun' },
  { action: 'DISBURSE_PAYROLL', entityType: 'PayrollRun' },
  { action: 'CREATE_DEPARTMENT', entityType: 'Department' },
  { action: 'UPDATE_DEPARTMENT', entityType: 'Department' },
  { action: 'CREATE_DESIGNATION', entityType: 'Designation' },
  { action: 'UPDATE_SHIFT', entityType: 'Shift' },
  { action: 'CREATE_SALARY_STRUCTURE', entityType: 'SalaryStructure' },
  { action: 'UPDATE_ROLE', entityType: 'Role' },
  { action: 'CREATE_ROLE', entityType: 'Role' },
  { action: 'MARK_ATTENDANCE', entityType: 'Attendance' },
  { action: 'APPROVE_EXPENSE', entityType: 'ExpenseClaim' },
  { action: 'CREATE_LETTER', entityType: 'Letter' },
  { action: 'UPDATE_COMPANY_SETTINGS', entityType: 'CompanySettings' },
  { action: 'CREATE_LOAN', entityType: 'LoanRecord' },
  { action: 'APPROVE_LOAN', entityType: 'LoanRecord' },
  { action: 'CREATE_ASSET', entityType: 'AssetAssignment' },
  { action: 'CREATE_TRAINING', entityType: 'TrainingProgram' },
  { action: 'UPDATE_LEAVE_POLICY', entityType: 'LeavePolicy' },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14) Mobile Chrome/124.0.0.0',
  'Avy ERP Mobile/1.0 (iOS 18.3)',
  'Avy ERP Mobile/1.0 (Android 14)',
];

const IP_ADDRESSES = [
  '192.168.1.10', '192.168.1.25', '10.0.0.42', '172.16.0.15',
  '103.45.67.89', '49.207.55.123', '223.186.44.201',
];

export const seeder: SeederModule = {
  name: 'Audit Logs',
  order: 24,
  seed: async (ctx) => {
    const { prisma, tenantId, employeeIds, employeeMap } = ctx;

    // Check existing
    const existing = await prisma.auditLog.count({ where: { tenantId } });
    if (existing >= 20) {
      log(MODULE, `Skipping — ${existing} audit logs already exist`);
      return;
    }

    const count = randomInt(25, 30);
    const records: Array<{
      tenantId: string;
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      oldValues: object | null;
      newValues: object | null;
      ipAddress: string;
      userAgent: string;
      timestamp: Date;
    }> = [];

    for (let i = 0; i < count; i++) {
      const entry = pickRandom(AUDIT_ACTIONS);
      const empId = pickRandom(employeeIds);
      const emp = employeeMap.get(empId);

      // Spread timestamps across past 3 months
      const dateStr = randomPastDate(3);
      const hour = randomInt(8, 19);
      const minute = randomInt(0, 59);
      const timestamp = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);

      let oldValues: object | null = null;
      let newValues: object | null = null;

      if (entry.action.startsWith('UPDATE_')) {
        oldValues = { status: 'DRAFT' };
        newValues = { status: 'ACTIVE' };
      } else if (entry.action === 'APPROVE_LEAVE') {
        oldValues = { status: 'PENDING' };
        newValues = { status: 'APPROVED', approvedBy: emp?.userId || 'system' };
      } else if (entry.action === 'LOGIN') {
        newValues = { loginAt: timestamp.toISOString() };
      }

      records.push({
        tenantId,
        userId: emp?.userId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: empId, // use empId as a representative entity ID
        oldValues,
        newValues,
        ipAddress: pickRandom(IP_ADDRESSES),
        userAgent: pickRandom(USER_AGENTS),
        timestamp,
      });
    }

    await prisma.auditLog.createMany({ data: records });

    log(MODULE, `Created ${records.length} audit log records`);
  },
};
