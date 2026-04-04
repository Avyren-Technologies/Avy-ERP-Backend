import bcrypt from 'bcryptjs';
import type { SeederModule, EmployeeSnapshot } from './types';
import { log, vlog } from './types';
import {
  pickRandom,
  randomInt,
  randomPhone,
  randomPastDate,
  generateName,
  generateEmail,
  fakePAN,
  fakeAadhaar,
  fakeUAN,
  fakeBankAccount,
  fakeIFSC,
  weightedPick,
  ctcForGrade,
  BLOOD_GROUPS,
  MARITAL_STATUSES,
  QUALIFICATIONS,
  UNIVERSITIES,
} from './utils';

const MODULE = 'employees';

const PASSWORD_HASH = bcrypt.hashSync('Password@123', 12);

export const seeder: SeederModule = {
  name: 'Employees',
  order: 3,
  seed: async (ctx) => {
    const { prisma, companyId, tenantId, employeeCount } = ctx;

    // Check existing employees
    const existingCount = await prisma.employee.count({ where: { companyId } });
    if (existingCount >= employeeCount) {
      log(MODULE, `Skipping — ${existingCount} employees already exist`);
      // Load existing data into context
      const existing = await prisma.employee.findMany({
        where: { companyId },
        include: { grade: { select: { code: true } }, user: { select: { id: true } } },
      });
      for (const emp of existing) {
        ctx.employeeIds.push(emp.id);
        ctx.employeeMap.set(emp.id, {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          officialEmail: emp.officialEmail || '',
          employeeId: emp.employeeId,
          departmentId: emp.departmentId,
          designationId: emp.designationId,
          gradeId: emp.gradeId || '',
          gradeCode: emp.grade?.code || 'G1',
          employeeTypeId: emp.employeeTypeId,
          locationId: emp.locationId || '',
          shiftId: emp.shiftId || '',
          joiningDate: emp.joiningDate.toISOString().split('T')[0],
          status: emp.status,
          annualCtc: Number(emp.annualCtc || 0),
          userId: emp.user?.id,
        });
      }
      // Identify managers (employees with reportees)
      const managersWithReportees = await prisma.employee.findMany({
        where: { companyId, reportees: { some: {} } },
        select: { id: true },
      });
      ctx.managerIds = managersWithReportees.map((m) => m.id);
      return;
    }

    // Resolve grade codes for assignment
    const gradeEntries = Array.from(ctx.gradeMap.values());
    const seniorGrades = gradeEntries.filter((g) => g.code === 'G4' || g.code === 'G5');
    const allGrades = gradeEntries;

    const managerCount = Math.min(4, employeeCount);
    const createdEmployees: EmployeeSnapshot[] = [];
    const managerIds: string[] = [];

    for (let i = 0; i < employeeCount; i++) {
      const isManager = i < managerCount;
      const gender: 'MALE' | 'FEMALE' = Math.random() < 0.6 ? 'MALE' : 'FEMALE';
      const { firstName, lastName } = generateName(gender);
      const empCode = `EMP${String(i + 1).padStart(4, '0')}`;
      const officialEmail = generateEmail(firstName, lastName, 'avyerp.demo');
      const personalEmail = generateEmail(firstName, lastName, 'gmail.com');

      // Grade assignment: managers get senior grades, others get random
      const grade = isManager
        ? pickRandom(seniorGrades)
        : pickRandom(allGrades);

      const departmentId = pickRandom(ctx.departmentIds);
      const designationId = pickRandom(ctx.designationIds);
      const employeeTypeId = pickRandom(ctx.employeeTypeIds);
      const locationId = pickRandom(ctx.locationIds);
      const shiftId = pickRandom(ctx.shiftIds);

      // Status distribution: 85% ACTIVE, 5% PROBATION, 5% CONFIRMED, 3% ON_NOTICE, 2% EXITED
      const status = isManager
        ? 'ACTIVE'
        : weightedPick([
            { value: 'ACTIVE' as const, weight: 85 },
            { value: 'PROBATION' as const, weight: 5 },
            { value: 'CONFIRMED' as const, weight: 5 },
            { value: 'ON_NOTICE' as const, weight: 3 },
            { value: 'EXITED' as const, weight: 2 },
          ]);

      // Joining date: 6-24 months ago
      const joiningDate = randomPastDate(randomInt(6, 24));

      // DOB: 25-45 years old
      const currentYear = new Date().getFullYear();
      const dobYear = currentYear - randomInt(25, 45);
      const dob = `${dobYear}-${String(randomInt(1, 12)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`;

      // Reporting manager: first 4 are managers, rest report to a random manager
      const reportingManagerId = isManager
        ? undefined
        : managerIds.length > 0
          ? pickRandom(managerIds)
          : undefined;

      const annualCtc = ctcForGrade(grade.code);

      // Create User record
      const user = await prisma.user.create({
        data: {
          email: officialEmail,
          password: PASSWORD_HASH,
          firstName,
          lastName,
          phone: randomPhone(),
          role: 'USER',
          isActive: status !== 'EXITED',
          companyId,
        },
      });

      // Create Employee record
      const employee = await prisma.employee.create({
        data: {
          companyId,
          employeeId: empCode,
          firstName,
          lastName,
          dateOfBirth: new Date(dob),
          gender: gender as 'MALE' | 'FEMALE',
          maritalStatus: pickRandom(MARITAL_STATUSES) as 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED',
          bloodGroup: pickRandom(BLOOD_GROUPS),
          nationality: 'Indian',
          personalMobile: randomPhone(),
          personalEmail,
          officialEmail,
          emergencyContactName: `${generateName(gender).firstName} ${lastName}`,
          emergencyContactRelation: pickRandom(['Spouse', 'Parent', 'Sibling']),
          emergencyContactMobile: randomPhone(),
          joiningDate: new Date(joiningDate),
          employeeTypeId,
          departmentId,
          designationId,
          gradeId: grade.id,
          reportingManagerId,
          workType: pickRandom(['ON_SITE', 'REMOTE', 'HYBRID']) as 'ON_SITE' | 'REMOTE' | 'HYBRID',
          shiftId,
          locationId,
          noticePeriodDays: pickRandom([30, 60, 90]),
          annualCtc,
          paymentMode: 'NEFT',
          panNumber: fakePAN(),
          aadhaarNumber: fakeAadhaar(),
          uan: fakeUAN(),
          bankAccountNumber: fakeBankAccount(),
          bankIfscCode: fakeIFSC(),
          bankName: pickRandom(['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank']),
          bankBranch: pickRandom(['MG Road', 'Koramangala', 'Whitefield', 'Indiranagar', 'HSR Layout']),
          accountType: 'SAVINGS',
          status: status as 'ACTIVE' | 'PROBATION' | 'CONFIRMED' | 'ON_NOTICE' | 'EXITED',
          lastWorkingDate: status === 'EXITED' ? new Date(randomPastDate(randomInt(1, 3))) : undefined,
        },
      });

      // Link User to Employee
      await prisma.user.update({
        where: { id: user.id },
        data: { employeeId: employee.id },
      });

      // Create TenantUser
      const roleId = isManager ? ctx.roleIds.managerRoleId : ctx.roleIds.employeeRoleId;
      await prisma.tenantUser.create({
        data: {
          userId: user.id,
          tenantId,
          roleId,
          isActive: status !== 'EXITED',
        },
      });

      // Create EmployeeTimeline entry (JOINED)
      await prisma.employeeTimeline.create({
        data: {
          employeeId: employee.id,
          eventType: 'JOINED',
          title: 'Employee Joined',
          description: `${firstName} ${lastName} joined as ${empCode}`,
          eventData: { joiningDate, grade: grade.code },
        },
      });

      // Create 1-2 EmployeeEducation records
      const eduCount = randomInt(1, 2);
      for (let e = 0; e < eduCount; e++) {
        await prisma.employeeEducation.create({
          data: {
            employeeId: employee.id,
            qualification: pickRandom(QUALIFICATIONS),
            degree: pickRandom(['Bachelor', 'Master', 'Diploma', 'Doctorate']),
            institution: `${pickRandom(['National', 'Regional', 'Central', 'State'])} Institute of Technology`,
            university: pickRandom(UNIVERSITIES),
            yearOfPassing: currentYear - randomInt(3, 20),
            marks: `${randomInt(55, 95)}%`,
          },
        });
      }

      // Create 1 EmployeeNominee record
      await prisma.employeeNominee.create({
        data: {
          employeeId: employee.id,
          name: `${generateName(gender === 'MALE' ? 'FEMALE' : 'MALE').firstName} ${lastName}`,
          relation: pickRandom(['Spouse', 'Father', 'Mother', 'Child']),
          sharePercent: 100,
          aadhaar: fakeAadhaar(),
        },
      });

      // Track managers
      if (isManager) {
        managerIds.push(employee.id);
      }

      const snapshot: EmployeeSnapshot = {
        id: employee.id,
        firstName,
        lastName,
        officialEmail,
        employeeId: empCode,
        departmentId,
        designationId,
        gradeId: grade.id,
        gradeCode: grade.code,
        employeeTypeId,
        locationId,
        shiftId,
        joiningDate,
        status,
        annualCtc,
        userId: user.id,
      };
      createdEmployees.push(snapshot);
      ctx.employeeMap.set(employee.id, snapshot);
      ctx.employeeIds.push(employee.id);

      vlog(ctx, MODULE, `Created ${empCode}: ${firstName} ${lastName} (${grade.code}, ${status})`);
    }

    ctx.managerIds = managerIds;
    log(MODULE, `Created ${createdEmployees.length} employees (${managerIds.length} managers, ${createdEmployees.length - managerIds.length} regular)`);
  },
};
