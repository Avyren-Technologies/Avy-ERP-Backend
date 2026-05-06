import { platformPrisma } from '../../../config/database';

const LEVEL_PRECEDENCE: Record<string, number> = {
  individual: 6,
  employeeType: 5,
  grade: 4,
  designation: 3,
  department: 2,
  company: 1,
};

/**
 * Resolve the effective leave policy for an employee + leave type.
 * Returns the base LeaveType config merged with the winning policy's overrides.
 * Precedence: individual > employeeType > grade > designation > department > company
 * Within same level: highest `priority` wins. If tied: most recently created.
 */
export async function resolveEffectivePolicy(
  companyId: string,
  employeeId: string,
  leaveTypeId: string,
) {
  const [employee, leaveType, policies] = await Promise.all([
    platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        departmentId: true,
        designationId: true,
        gradeId: true,
        employeeTypeId: true,
      },
    }),
    platformPrisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
    platformPrisma.leavePolicy.findMany({
      where: { companyId, leaveTypeId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  if (!leaveType) return null;
  if (!employee || policies.length === 0) return leaveType;

  const matchingPolicies = policies.filter((p) => {
    switch (p.assignmentLevel) {
      case 'individual':
        return p.assignmentId === employeeId;
      case 'employeeType':
        return p.assignmentId === employee.employeeTypeId;
      case 'grade':
        return p.assignmentId === employee.gradeId;
      case 'designation':
        return p.assignmentId === employee.designationId;
      case 'department':
        return p.assignmentId === employee.departmentId;
      case 'company':
        return true;
      default:
        return false;
    }
  });

  if (matchingPolicies.length === 0) return leaveType;

  matchingPolicies.sort((a, b) => {
    const levelDiff =
      (LEVEL_PRECEDENCE[b.assignmentLevel] ?? 0) -
      (LEVEL_PRECEDENCE[a.assignmentLevel] ?? 0);
    if (levelDiff !== 0) return levelDiff;
    const priorDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorDiff !== 0) return priorDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const winningPolicy = matchingPolicies[0]!;
  const overrides = winningPolicy.overrides as Record<string, unknown> | null;

  if (!overrides || typeof overrides !== 'object') return leaveType;

  return {
    ...leaveType,
    ...overrides,
    _policyId: winningPolicy.id,
    _policyLevel: winningPolicy.assignmentLevel,
  };
}
