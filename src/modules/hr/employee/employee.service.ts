import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { hashPassword, generateNextNumber } from '../../../shared/utils';
import { getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { LeaveService } from '../leave/leave.service';
import {
  computeProbationEndDateFromMasters,
  normalizeProbationEndForDb,
  parseHrDateInput,
} from '../../../shared/utils/employee-probation-notice';
import { n } from '../../../shared/utils/prisma-helpers';
import { notificationService } from '../../../core/notifications/notification.service';

export class EmployeeService {

  // ────────────────────────────────────────────────────────────────────
  // Employee CRUD
  // ────────────────────────────────────────────────────────────────────

  async listEmployees(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      departmentId?: string;
      designationId?: string;
      locationId?: string;
      status?: string;
      employeeTypeId?: string;
      sortBy?: string;
      sortOrder?: string;
    } = {},
  ) {
    const { page = 1, limit = 25, search, departmentId, designationId, locationId, status, employeeTypeId, sortBy, sortOrder } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status.toUpperCase() as any;
    }
    if (departmentId) {
      where.departmentId = departmentId;
    }
    if (designationId) {
      where.designationId = designationId;
    }
    if (locationId) {
      where.locationId = locationId;
    }
    if (employeeTypeId) {
      where.employeeTypeId = employeeTypeId;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { personalEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { tenant: { select: { id: true } } },
    });
    const tenantId = company?.tenant?.id;

    const listInclude = {
      department: { select: { id: true, name: true, code: true } },
      designation: { select: { id: true, name: true, code: true } },
      grade: { select: { id: true, name: true, code: true } },
      employeeType: { select: { id: true, name: true, code: true } },
      location: { select: { id: true, name: true, code: true } },
      shift: { select: { id: true, name: true } },
      reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      ...(tenantId
        ? {
            user: {
              select: {
                tenantUsers: {
                  where: { tenantId },
                  take: 1,
                  select: { role: { select: { name: true } } },
                },
              },
            },
          }
        : {}),
    } satisfies Prisma.EmployeeInclude;

    // Build orderBy — support sorting by employeeId or fallback to createdAt
    const allowedSortFields = ['employeeId', 'firstName', 'lastName', 'joiningDate', 'createdAt', 'status'];
    const resolvedSortBy = sortBy && allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const resolvedSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await Promise.all([
      platformPrisma.employee.findMany({
        where,
        include: listInclude,
        skip: offset,
        take: limit,
        orderBy: { [resolvedSortBy]: resolvedSortOrder },
      }),
      platformPrisma.employee.count({ where }),
    ]);

    const employees = rows.map((e) => {
      const u = e.user as { tenantUsers?: Array<{ role?: { name: string } | null }> } | null | undefined;
      const rbacRoleName = u?.tenantUsers?.[0]?.role?.name ?? null;
      const { user: _user, ...rest } = e;
      return { ...rest, rbacRoleName };
    });

    return { employees, total, page, limit };
  }

  async getEmployee(companyId: string, id: string) {
    const employee = await platformPrisma.employee.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true, probationMonths: true, noticeDays: true } },
        employeeType: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        geofence: { select: { id: true, name: true, lat: true, lng: true, radius: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        costCentre: { select: { id: true, name: true, code: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        functionalManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        nominees: { orderBy: { createdAt: 'asc' } },
        education: { orderBy: { yearOfPassing: 'desc' } },
        previousEmployment: { orderBy: { leaveDate: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        timeline: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
      },
    });

    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    return employee;
  }

  async createEmployee(companyId: string, data: any, performedBy?: string) {
    // Validate references exist (outside transaction — read-only checks)
    await this.validateReferences(companyId, data);

    // Check email uniqueness within the company
    if (data.personalEmail) {
      const existingByPersonalEmail = await platformPrisma.employee.findFirst({
        where: { companyId, personalEmail: data.personalEmail, status: { not: 'EXITED' } },
        select: { id: true, employeeId: true },
      });
      if (existingByPersonalEmail) {
        throw ApiError.conflict(
          `An active employee (${existingByPersonalEmail.employeeId}) already has this personal email`
        );
      }
    }

    if (data.officialEmail) {
      const existingByOfficialEmail = await platformPrisma.employee.findFirst({
        where: { companyId, officialEmail: data.officialEmail, status: { not: 'EXITED' } },
        select: { id: true, employeeId: true },
      });
      if (existingByOfficialEmail) {
        throw ApiError.conflict(
          `An active employee (${existingByOfficialEmail.employeeId}) already has this official email`
        );
      }
    }

    // Auto-assign default shift if none provided
    if (!data.shiftId) {
      try {
        const defaultShift = await platformPrisma.companyShift.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true },
        });
        if (defaultShift) {
          data.shiftId = defaultShift.id;
          logger.info(`Auto-assigned default shift "${defaultShift.name}" (${defaultShift.id}) for new employee`);
        }
      } catch (err) {
        logger.warn('Failed to auto-assign default shift for new employee', err);
      }
    }

    // Atomic ID generation eliminates collisions — no retry loop needed
    const employee = await platformPrisma.$transaction(async (tx) => {
          const employeeId = await generateNextNumber(tx as any, companyId, ['Employee', 'Employee Onboarding'], 'Employee');

          const [designationRow, gradeRow] = await Promise.all([
            data.designationId
              ? tx.designation.findUnique({
                  where: { id: data.designationId },
                  select: { probationDays: true },
                })
              : null,
            data.gradeId
              ? tx.grade.findUnique({
                  where: { id: data.gradeId },
                  select: { probationMonths: true, noticeDays: true },
                })
              : null,
          ]);

          const joiningDateObj = parseHrDateInput(data.joiningDate);
          if (!joiningDateObj) {
            throw ApiError.badRequest('Invalid or out-of-range joining date');
          }

          const dateOfBirthParsed = parseHrDateInput(data.dateOfBirth);
          if (!dateOfBirthParsed) {
            throw ApiError.badRequest('Invalid or out-of-range date of birth');
          }

          let noticePeriodDays = n(data.noticePeriodDays);
          if (noticePeriodDays == null && gradeRow?.noticeDays != null) {
            noticePeriodDays = gradeRow.noticeDays;
          }

          let probationEndDate: Date | null = null;
          if (data.probationEndDate) {
            probationEndDate = normalizeProbationEndForDb(parseHrDateInput(data.probationEndDate));
          }
          if (probationEndDate == null) {
            probationEndDate = computeProbationEndDateFromMasters({
              joiningDate: joiningDateObj,
              designationProbationDays: designationRow?.probationDays ?? null,
              gradeProbationMonths: gradeRow?.probationMonths ?? null,
            });
          }

          const passportExpiryParsed = data.passportExpiry ? parseHrDateInput(data.passportExpiry) : null;

          const employee = await tx.employee.create({
            data: {
              companyId,
              employeeId,

              // Personal
              firstName: data.firstName,
              middleName: n(data.middleName),
              lastName: data.lastName,
              dateOfBirth: dateOfBirthParsed,
              gender: data.gender,
              maritalStatus: n(data.maritalStatus),
              bloodGroup: n(data.bloodGroup),
              fatherMotherName: n(data.fatherMotherName),
              nationality: data.nationality ?? 'Indian',
              religion: n(data.religion),
              category: n(data.category),
              differentlyAbled: data.differentlyAbled ?? false,
              disabilityType: n(data.disabilityType),
              profilePhotoUrl: n(data.profilePhotoUrl),

              // Contact
              personalMobile: data.personalMobile,
              alternativeMobile: n(data.alternativeMobile),
              personalEmail: n(data.personalEmail),
              officialEmail: n(data.officialEmail),
              currentAddress: data.currentAddress ? (data.currentAddress as any) : Prisma.JsonNull,
              permanentAddress: data.permanentAddress ? (data.permanentAddress as any) : Prisma.JsonNull,
              emergencyContactName: data.emergencyContactName,
              emergencyContactRelation: data.emergencyContactRelation,
              emergencyContactMobile: data.emergencyContactMobile,

              // Professional
              joiningDate: joiningDateObj,
              employeeTypeId: data.employeeTypeId,
              departmentId: data.departmentId,
              designationId: data.designationId,
              gradeId: n(data.gradeId),
              reportingManagerId: n(data.reportingManagerId),
              functionalManagerId: n(data.functionalManagerId),
              workType: n(data.workType),
              shiftId: n(data.shiftId),
              costCentreId: n(data.costCentreId),
              locationId: n(data.locationId),
              geofenceId: n(data.geofenceId),
              noticePeriodDays,
              probationEndDate,

              // Salary
              annualCtc: data.annualCtc ?? null,
              salaryStructure: data.salaryStructure ? (data.salaryStructure as any) : Prisma.JsonNull,
              paymentMode: n(data.paymentMode),

              // Bank
              bankAccountNumber: n(data.bankAccountNumber),
              bankIfscCode: n(data.bankIfscCode),
              bankName: n(data.bankName),
              bankBranch: n(data.bankBranch),
              accountType: n(data.accountType),

              // Statutory
              panNumber: n(data.panNumber),
              aadhaarNumber: n(data.aadhaarNumber),
              uan: n(data.uan),
              esiIpNumber: n(data.esiIpNumber),
              passportNumber: n(data.passportNumber),
              passportExpiry: passportExpiryParsed,
              drivingLicence: n(data.drivingLicence),
              voterId: n(data.voterId),
              pran: n(data.pran),

              // Status: configurable initial status, defaults to PROBATION
              status: data.initialStatus ?? 'PROBATION',

              // Timeline: JOINED event
              timeline: {
                create: {
                  eventType: 'JOINED',
                  title: 'Employee Joined',
                  description: `${data.firstName} ${data.lastName} joined the organization`,
                  eventData: { joiningDate: data.joiningDate, employeeId } as any,
                  performedBy: n(performedBy),
                },
              },
            },
            include: {
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              grade: { select: { id: true, name: true, code: true } },
              employeeType: { select: { id: true, name: true, code: true } },
              timeline: true,
            },
          });

          // Auto-assign default geofence if location set and no geofence specified
          if (!data.geofenceId && employee.locationId) {
            const defaultGeofence = await tx.geofence.findFirst({
              where: { locationId: employee.locationId, isDefault: true, isActive: true },
              select: { id: true },
            });
            if (defaultGeofence) {
              await tx.employee.update({
                where: { id: employee.id },
                data: { geofenceId: defaultGeofence.id },
              });
            }
          }

          // Auto-link to User if work or personal email matches an existing User in the same company
          const linkEmails = [
            ...new Set(
              [data.officialEmail, data.personalEmail]
                .map((e) => (typeof e === 'string' ? e.trim() : ''))
                .filter((e) => e.length > 0),
            ),
          ];
          for (const email of linkEmails) {
            const matchingUser = await tx.user.findFirst({
              where: {
                email,
                companyId,
                employeeId: null, // not already linked
              },
              select: { id: true },
            });
            if (matchingUser) {
              await tx.user.update({
                where: { id: matchingUser.id },
                data: { employeeId: employee.id },
              });
              logger.info(`Auto-linked employee ${employee.id} to user ${matchingUser.id} (${email})`);
              break;
            }
          }

          // Optionally create a User (login) account — login email prefers work, then personal
          const loginEmail =
            (data.officialEmail && String(data.officialEmail).trim()) ||
            (data.personalEmail && String(data.personalEmail).trim()) ||
            '';
          if (data.createUserAccount && loginEmail && data.userPassword) {
            // Check if a user with this email already exists
            const existingUser = await tx.user.findUnique({
              where: { email: loginEmail },
              select: { id: true },
            });

            if (existingUser) {
              // Link the existing user to this employee if not already linked
              await tx.user.update({
                where: { id: existingUser.id },
                data: { employeeId: employee.id },
              });
              logger.info(`Linked existing user ${existingUser.id} to new employee ${employee.id}`);
            } else {
              const hashedPassword = await hashPassword(data.userPassword);
              const newUser = await tx.user.create({
                data: {
                  email: loginEmail,
                  password: hashedPassword,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  role: 'COMPANY_ADMIN',
                  companyId,
                  employeeId: employee.id,
                  isActive: true,
                },
              });

              // Create TenantUser bridge record with dynamic RBAC role
              const company = await tx.company.findUnique({
                where: { id: companyId },
                select: { tenant: { select: { id: true } } },
              });
              const tenantId = company?.tenant?.id;
              if (tenantId) {
                // Use the selected dynamic role, or fall back to default system role
                let roleId = data.userRole || null;
                if (roleId) {
                  // Validate the provided role exists in this tenant
                  const role = await tx.role.findFirst({
                    where: { id: roleId, tenantId },
                  });
                  if (!role) {
                    roleId = null; // Invalid role, fall back to default
                  }
                }
                if (!roleId) {
                  const defaultRole = await tx.role.findFirst({
                    where: { tenantId, isSystem: true },
                  });
                  roleId = defaultRole?.id || null;
                }
                if (roleId) {
                  await tx.tenantUser.create({
                    data: {
                      userId: newUser.id,
                      tenantId,
                      roleId,
                    },
                  });
                }
              }

              logger.info(`Created user account ${newUser.id} (${newUser.email}) for employee ${employee.id}`);
            }
          }

          // Auto-generate onboarding tasks from default template
          const defaultTemplate = await tx.onboardingTemplate.findFirst({
            where: { companyId, isDefault: true },
          });
          if (defaultTemplate) {
            const items = defaultTemplate.items as any[];
            const joiningDate = joiningDateObj;
            const tasks = items.map((item: any) => ({
              employeeId: employee.id,
              templateId: defaultTemplate.id,
              title: item.title,
              department: item.department,
              description: item.description ?? null,
              dueDate: item.dueInDays ? new Date(joiningDate.getTime() + item.dueInDays * 86400000) : null,
              isMandatory: item.isMandatory ?? true,
              status: 'PENDING',
              companyId,
            }));
            if (tasks.length > 0) {
              await tx.onboardingTask.createMany({ data: tasks });
            }
            logger.info(`Auto-generated ${tasks.length} onboarding tasks for employee ${employee.id}`);
          }

          logger.info(`Employee created: ${employee.id} (${employee.employeeId}) for company ${companyId}`);
          return employee;
        });

    // ── Post-creation seeding (non-blocking — failures are logged, not thrown) ──
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';

    // 1. Initialize leave balances for the current year
    try {
      const leaveService = new LeaveService();
      const currentYear = DateTime.now().setZone(companyTimezone).year;
      await leaveService.initializeBalances(companyId, {
        employeeId: employee.id,
        year: currentYear,
      });
      logger.info(`Auto-initialized leave balances for employee ${employee.id}, year ${currentYear}`);
    } catch (err) {
      logger.warn(`Failed to auto-initialize leave balances for employee ${employee.id}`, err);
    }

    // 2. Schedule probation review if employee has a probation end date
    try {
      const createdEmployee = await platformPrisma.employee.findUnique({
        where: { id: employee.id },
        select: { probationEndDate: true, joiningDate: true },
      });
      if (createdEmployee?.probationEndDate) {
        await platformPrisma.probationReview.create({
          data: {
            employeeId: employee.id,
            reviewDate: createdEmployee.probationEndDate,
            probationEndDate: createdEmployee.probationEndDate,
            decision: 'PENDING',
            companyId,
          },
        });
        logger.info(`Auto-created probation review for employee ${employee.id}, due ${createdEmployee.probationEndDate.toISOString()}`);
      }
    } catch (err) {
      logger.warn(`Failed to auto-create probation review for employee ${employee.id}`, err);
    }

    // 3. Create IT declaration placeholder for the current financial year
    try {
      const nowDt = DateTime.now().setZone(companyTimezone);
      // Indian financial year: April to March. If month < April (Luxon 1-indexed: 4), FY started previous year.
      const fyStartYear = nowDt.month < 4 ? nowDt.year - 1 : nowDt.year;
      const financialYear = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

      await platformPrisma.iTDeclaration.create({
        data: {
          employeeId: employee.id,
          financialYear,
          regime: 'NEW',
          status: 'DRAFT',
          companyId,
        },
      });
      logger.info(`Auto-created IT declaration (${financialYear}) for employee ${employee.id}`);
    } catch (err) {
      logger.warn(`Failed to auto-create IT declaration for employee ${employee.id}`, err);
    }

    // 4. Dispatch onboarding notification to the new employee (non-blocking)
    try {
      const enriched = await platformPrisma.employee.findUnique({
        where: { id: employee.id },
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
          joiningDate: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
          user: { select: { id: true } },
        },
      });
      if (enriched?.user?.id) {
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'EMPLOYEE_ONBOARDED',
          entityType: 'Employee',
          entityId: employee.id,
          explicitRecipients: [enriched.user.id],
          tokens: {
            employee_name: `${enriched.firstName ?? ''} ${enriched.lastName ?? ''}`.trim(),
            employee_id: enriched.employeeId,
            designation: enriched.designation?.name ?? '',
            department: enriched.department?.name ?? '',
            joining_date: enriched.joiningDate.toISOString().slice(0, 10),
          },
          type: 'EMPLOYEE_LIFECYCLE',
        });
      }
    } catch (err) {
      logger.warn('Employee onboarded dispatch failed (non-blocking)', { error: err, employeeId: employee.id });
    }

    return employee;
  }

  async updateEmployee(companyId: string, id: string, data: any, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Check email uniqueness when emails change
    if (data.personalEmail && data.personalEmail !== existing.personalEmail) {
      const dup = await platformPrisma.employee.findFirst({
        where: { companyId, personalEmail: data.personalEmail, status: { not: 'EXITED' }, id: { not: id } },
        select: { id: true, employeeId: true },
      });
      if (dup) {
        throw ApiError.conflict(`An active employee (${dup.employeeId}) already has this personal email`);
      }
    }
    if (data.officialEmail && data.officialEmail !== existing.officialEmail) {
      const dup = await platformPrisma.employee.findFirst({
        where: { companyId, officialEmail: data.officialEmail, status: { not: 'EXITED' }, id: { not: id } },
        select: { id: true, employeeId: true },
      });
      if (dup) {
        throw ApiError.conflict(`An active employee (${dup.employeeId}) already has this official email`);
      }
    }

    // Validate references if they're being changed
    if (data.departmentId || data.designationId || data.employeeTypeId || data.gradeId) {
      await this.validateReferences(companyId, {
        departmentId: data.departmentId ?? existing.departmentId,
        designationId: data.designationId ?? existing.designationId,
        employeeTypeId: data.employeeTypeId ?? existing.employeeTypeId,
        gradeId: data.gradeId ?? existing.gradeId,
        reportingManagerId: data.reportingManagerId,
        functionalManagerId: data.functionalManagerId,
        shiftId: data.shiftId,
        costCentreId: data.costCentreId,
        locationId: data.locationId,
      });
    }

    const nextDesignationId = data.designationId ?? existing.designationId;
    const nextGradeId = data.gradeId ?? existing.gradeId;

    let joiningForProbation = existing.joiningDate;
    if (data.joiningDate !== undefined) {
      const j = parseHrDateInput(data.joiningDate);
      if (!j) {
        throw ApiError.badRequest('Invalid or out-of-range joining date');
      }
      joiningForProbation = j;
    }

    let probationEndDate: Date | null | undefined = undefined;
    if (data.probationEndDate !== undefined) {
      probationEndDate = data.probationEndDate
        ? normalizeProbationEndForDb(parseHrDateInput(data.probationEndDate))
        : null;
    } else if (
      (data.designationId && data.designationId !== existing.designationId) ||
      (data.gradeId && data.gradeId !== existing.gradeId) ||
      data.joiningDate !== undefined
    ) {
      const [designationRow, gradeRow] = await Promise.all([
        nextDesignationId
          ? platformPrisma.designation.findUnique({
              where: { id: nextDesignationId },
              select: { probationDays: true },
            })
          : null,
        nextGradeId
          ? platformPrisma.grade.findUnique({
              where: { id: nextGradeId },
              select: { probationMonths: true, noticeDays: true },
            })
          : null,
      ]);
      probationEndDate = computeProbationEndDateFromMasters({
        joiningDate: joiningForProbation,
        designationProbationDays: designationRow?.probationDays ?? null,
        gradeProbationMonths: gradeRow?.probationMonths ?? null,
      });
    }

    // Build update data, only including provided fields
    const updateData: any = {};

    // Personal fields
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = n(data.middleName);
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dateOfBirth !== undefined) {
      const dob = parseHrDateInput(data.dateOfBirth);
      if (!dob) {
        throw ApiError.badRequest('Invalid or out-of-range date of birth');
      }
      updateData.dateOfBirth = dob;
    }
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.maritalStatus !== undefined) updateData.maritalStatus = n(data.maritalStatus);
    if (data.bloodGroup !== undefined) updateData.bloodGroup = n(data.bloodGroup);
    if (data.fatherMotherName !== undefined) updateData.fatherMotherName = n(data.fatherMotherName);
    if (data.nationality !== undefined) updateData.nationality = data.nationality;
    if (data.religion !== undefined) updateData.religion = n(data.religion);
    if (data.category !== undefined) updateData.category = n(data.category);
    if (data.differentlyAbled !== undefined) updateData.differentlyAbled = data.differentlyAbled;
    if (data.disabilityType !== undefined) updateData.disabilityType = n(data.disabilityType);
    if (data.profilePhotoUrl !== undefined) updateData.profilePhotoUrl = n(data.profilePhotoUrl);

    // Contact
    if (data.personalMobile !== undefined) updateData.personalMobile = data.personalMobile;
    if (data.alternativeMobile !== undefined) updateData.alternativeMobile = n(data.alternativeMobile);
    if (data.personalEmail !== undefined) updateData.personalEmail = data.personalEmail;
    if (data.officialEmail !== undefined) updateData.officialEmail = n(data.officialEmail);
    if (data.currentAddress !== undefined) updateData.currentAddress = data.currentAddress ? (data.currentAddress as any) : Prisma.JsonNull;
    if (data.permanentAddress !== undefined) updateData.permanentAddress = data.permanentAddress ? (data.permanentAddress as any) : Prisma.JsonNull;
    if (data.emergencyContactName !== undefined) updateData.emergencyContactName = data.emergencyContactName;
    if (data.emergencyContactRelation !== undefined) updateData.emergencyContactRelation = data.emergencyContactRelation;
    if (data.emergencyContactMobile !== undefined) updateData.emergencyContactMobile = data.emergencyContactMobile;

    // Professional
    if (data.joiningDate !== undefined) updateData.joiningDate = joiningForProbation;
    if (data.employeeTypeId !== undefined) updateData.employeeTypeId = data.employeeTypeId;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId;
    if (data.designationId !== undefined) updateData.designationId = data.designationId;
    if (data.gradeId !== undefined) updateData.gradeId = n(data.gradeId);
    if (data.reportingManagerId !== undefined) updateData.reportingManagerId = n(data.reportingManagerId);
    if (data.functionalManagerId !== undefined) updateData.functionalManagerId = n(data.functionalManagerId);
    if (data.workType !== undefined) updateData.workType = n(data.workType);
    if (data.shiftId !== undefined) updateData.shiftId = n(data.shiftId);
    if (data.costCentreId !== undefined) updateData.costCentreId = n(data.costCentreId);
    if (data.locationId !== undefined) updateData.locationId = n(data.locationId);

    // If location changed, reassign default geofence (unless explicitly provided)
    if (data.locationId !== undefined && data.locationId !== existing.locationId) {
      if (data.geofenceId === undefined) {
        // Clear old geofence and assign new location's default
        const defaultGf = data.locationId
          ? await platformPrisma.geofence.findFirst({
              where: { locationId: data.locationId, isDefault: true, isActive: true },
              select: { id: true },
            })
          : null;
        updateData.geofenceId = defaultGf?.id ?? null;
      }
    }
    // Explicit geofenceId in update data
    if (data.geofenceId !== undefined) {
      updateData.geofenceId = data.geofenceId || null;
    }

    if (data.noticePeriodDays !== undefined) {
      updateData.noticePeriodDays = n(data.noticePeriodDays);
    } else if (data.gradeId && data.gradeId !== existing.gradeId) {
      const g = await platformPrisma.grade.findUnique({
        where: { id: data.gradeId },
        select: { noticeDays: true },
      });
      if (g?.noticeDays != null) {
        updateData.noticePeriodDays = g.noticeDays;
      }
    }
    if (probationEndDate !== undefined) updateData.probationEndDate = probationEndDate;

    // Salary
    if (data.annualCtc !== undefined) updateData.annualCtc = data.annualCtc ?? null;
    if (data.salaryStructure !== undefined) updateData.salaryStructure = data.salaryStructure ? (data.salaryStructure as any) : Prisma.JsonNull;
    if (data.paymentMode !== undefined) updateData.paymentMode = n(data.paymentMode);

    // Bank
    if (data.bankAccountNumber !== undefined) updateData.bankAccountNumber = n(data.bankAccountNumber);
    if (data.bankIfscCode !== undefined) updateData.bankIfscCode = n(data.bankIfscCode);
    if (data.bankName !== undefined) updateData.bankName = n(data.bankName);
    if (data.bankBranch !== undefined) updateData.bankBranch = n(data.bankBranch);
    if (data.accountType !== undefined) updateData.accountType = n(data.accountType);

    // Statutory
    if (data.panNumber !== undefined) updateData.panNumber = n(data.panNumber);
    if (data.aadhaarNumber !== undefined) updateData.aadhaarNumber = n(data.aadhaarNumber);
    if (data.uan !== undefined) updateData.uan = n(data.uan);
    if (data.esiIpNumber !== undefined) updateData.esiIpNumber = n(data.esiIpNumber);
    if (data.passportNumber !== undefined) updateData.passportNumber = n(data.passportNumber);
    if (data.passportExpiry !== undefined) {
      updateData.passportExpiry = data.passportExpiry ? parseHrDateInput(data.passportExpiry) : null;
      if (data.passportExpiry && updateData.passportExpiry == null) {
        throw ApiError.badRequest('Invalid or out-of-range passport expiry date');
      }
    }
    if (data.drivingLicence !== undefined) updateData.drivingLicence = n(data.drivingLicence);
    if (data.voterId !== undefined) updateData.voterId = n(data.voterId);
    if (data.pran !== undefined) updateData.pran = n(data.pran);

    const employee = await platformPrisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        employeeType: { select: { id: true, name: true, code: true } },
      },
    });

    // Auto-link/re-link User ↔ Employee when officialEmail changes
    if (data.officialEmail !== undefined && data.officialEmail !== existing.officialEmail) {
      // Remove old link (if any user was linked to this employee)
      const previouslyLinked = await platformPrisma.user.findUnique({
        where: { employeeId: id },
        select: { id: true },
      });
      if (previouslyLinked) {
        await platformPrisma.user.update({
          where: { id: previouslyLinked.id },
          data: { employeeId: null },
        });
      }

      // Link to new matching user (if the new officialEmail matches a user)
      if (data.officialEmail) {
        const matchingUser = await platformPrisma.user.findFirst({
          where: {
            email: data.officialEmail,
            companyId,
            employeeId: null,
          },
          select: { id: true },
        });
        if (matchingUser) {
          await platformPrisma.user.update({
            where: { id: matchingUser.id },
            data: { employeeId: id },
          });
          logger.info(`Re-linked employee ${id} to user ${matchingUser.id} on officialEmail change`);
        }
      }
    }

    // Add timeline for significant changes (department, designation, grade)
    const changes: string[] = [];
    if (data.departmentId && data.departmentId !== existing.departmentId) changes.push('department');
    if (data.designationId && data.designationId !== existing.designationId) changes.push('designation');
    if (data.gradeId && data.gradeId !== existing.gradeId) changes.push('grade');
    if (data.annualCtc !== undefined && data.annualCtc !== Number(existing.annualCtc)) changes.push('salary');

    if (changes.length > 0) {
      const eventType = changes.includes('salary') ? 'SALARY_REVISED'
        : changes.includes('designation') ? 'PROMOTED'
        : 'TRANSFERRED';

      await this.addTimelineEvent(
        id,
        eventType,
        `Profile Updated: ${changes.join(', ')}`,
        `Updated fields: ${changes.join(', ')}`,
        { changes, updatedFields: Object.keys(updateData) },
        performedBy,
      );
    }

    return employee;
  }

  async updateEmployeeStatus(companyId: string, id: string, data: any, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    const updateData: any = { status: data.status };

    // Set confirmation date when confirmed
    if (data.status === 'CONFIRMED' && existing.status === 'PROBATION') {
      updateData.confirmationDate = new Date();
    }

    // Set last working date when exiting
    if (data.status === 'EXITED' || data.status === 'ON_NOTICE') {
      if (data.lastWorkingDate) updateData.lastWorkingDate = new Date(data.lastWorkingDate);
      if (data.exitReason) updateData.exitReason = data.exitReason;
    }

    const employee = await platformPrisma.employee.update({
      where: { id },
      data: updateData,
    });

    // Map status to timeline event type
    const eventTypeMap: Record<string, string> = {
      ACTIVE: 'CUSTOM',
      PROBATION: 'PROBATION_STARTED',
      CONFIRMED: 'CONFIRMED',
      ON_NOTICE: 'RESIGNED',
      SUSPENDED: 'CUSTOM',
      EXITED: 'EXITED',
    };

    await this.addTimelineEvent(
      id,
      eventTypeMap[data.status] || 'CUSTOM',
      `Status changed to ${data.status}`,
      data.exitReason || `Employee status updated from ${existing.status} to ${data.status}`,
      { previousStatus: existing.status, newStatus: data.status, lastWorkingDate: data.lastWorkingDate },
      performedBy,
    );

    return employee;
  }

  async deleteEmployee(companyId: string, id: string, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Soft delete: set status to EXITED
    const employee = await platformPrisma.employee.update({
      where: { id },
      data: {
        status: 'EXITED',
        lastWorkingDate: new Date(),
      },
    });

    await this.addTimelineEvent(
      id,
      'EXITED',
      'Employee Record Deactivated',
      'Employee record was soft-deleted (status set to EXITED)',
      { previousStatus: existing.status },
      performedBy,
    );

    logger.info(`Employee soft-deleted: ${id} (${existing.employeeId}) for company ${companyId}`);
    return { message: 'Employee deactivated (soft-deleted)', employeeId: existing.employeeId };
  }

  // ────────────────────────────────────────────────────────────────────
  // Nominees
  // ────────────────────────────────────────────────────────────────────

  async listNominees(employeeId: string) {
    return platformPrisma.employeeNominee.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addNominee(employeeId: string, data: any) {
    // Validate total share percent does not exceed 100
    const existingNominees = await platformPrisma.employeeNominee.findMany({
      where: { employeeId },
      select: { sharePercent: true },
    });

    const currentTotal = existingNominees.reduce(
      (sum, nom) => sum + (nom.sharePercent ? Number(nom.sharePercent) : 0),
      0,
    );
    const newShare = data.sharePercent || 0;

    if (currentTotal + newShare > 100) {
      throw ApiError.badRequest(
        `Total nominee share cannot exceed 100%. Current total: ${currentTotal}%, requested: ${newShare}%`,
      );
    }

    return platformPrisma.employeeNominee.create({
      data: {
        employeeId,
        name: data.name,
        relation: data.relation,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        sharePercent: data.sharePercent ?? null,
        aadhaar: n(data.aadhaar),
        pan: n(data.pan),
        address: data.address ? (data.address as any) : Prisma.JsonNull,
      },
    });
  }

  async updateNominee(employeeId: string, nomineeId: string, data: any) {
    const nominee = await platformPrisma.employeeNominee.findUnique({ where: { id: nomineeId } });
    if (!nominee || nominee.employeeId !== employeeId) {
      throw ApiError.notFound('Nominee not found');
    }

    // Validate share percent if being updated
    if (data.sharePercent !== undefined) {
      const existingNominees = await platformPrisma.employeeNominee.findMany({
        where: { employeeId, id: { not: nomineeId } },
        select: { sharePercent: true },
      });

      const othersTotal = existingNominees.reduce(
        (sum, nom) => sum + (nom.sharePercent ? Number(nom.sharePercent) : 0),
        0,
      );

      if (othersTotal + (data.sharePercent || 0) > 100) {
        throw ApiError.badRequest(
          `Total nominee share cannot exceed 100%. Others total: ${othersTotal}%, requested: ${data.sharePercent}%`,
        );
      }
    }

    return platformPrisma.employeeNominee.update({
      where: { id: nomineeId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.relation !== undefined && { relation: data.relation }),
        ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }),
        ...(data.sharePercent !== undefined && { sharePercent: data.sharePercent ?? null }),
        ...(data.aadhaar !== undefined && { aadhaar: n(data.aadhaar) }),
        ...(data.pan !== undefined && { pan: n(data.pan) }),
        ...(data.address !== undefined && { address: data.address ? (data.address as any) : Prisma.JsonNull }),
      },
    });
  }

  async deleteNominee(employeeId: string, nomineeId: string) {
    const nominee = await platformPrisma.employeeNominee.findUnique({ where: { id: nomineeId } });
    if (!nominee || nominee.employeeId !== employeeId) {
      throw ApiError.notFound('Nominee not found');
    }

    await platformPrisma.employeeNominee.delete({ where: { id: nomineeId } });
    return { message: 'Nominee deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Education
  // ────────────────────────────────────────────────────────────────────

  async listEducation(employeeId: string) {
    return platformPrisma.employeeEducation.findMany({
      where: { employeeId },
      orderBy: { yearOfPassing: 'desc' },
    });
  }

  async addEducation(employeeId: string, data: any) {
    return platformPrisma.employeeEducation.create({
      data: {
        employeeId,
        qualification: data.qualification,
        degree: n(data.degree),
        institution: n(data.institution),
        university: n(data.university),
        yearOfPassing: n(data.yearOfPassing),
        marks: n(data.marks),
        certificateUrl: n(data.certificateUrl),
      },
    });
  }

  async updateEducation(employeeId: string, educationId: string, data: any) {
    const edu = await platformPrisma.employeeEducation.findUnique({ where: { id: educationId } });
    if (!edu || edu.employeeId !== employeeId) {
      throw ApiError.notFound('Education record not found');
    }

    return platformPrisma.employeeEducation.update({
      where: { id: educationId },
      data: {
        ...(data.qualification !== undefined && { qualification: data.qualification }),
        ...(data.degree !== undefined && { degree: n(data.degree) }),
        ...(data.institution !== undefined && { institution: n(data.institution) }),
        ...(data.university !== undefined && { university: n(data.university) }),
        ...(data.yearOfPassing !== undefined && { yearOfPassing: n(data.yearOfPassing) }),
        ...(data.marks !== undefined && { marks: n(data.marks) }),
        ...(data.certificateUrl !== undefined && { certificateUrl: n(data.certificateUrl) }),
      },
    });
  }

  async deleteEducation(employeeId: string, educationId: string) {
    const edu = await platformPrisma.employeeEducation.findUnique({ where: { id: educationId } });
    if (!edu || edu.employeeId !== employeeId) {
      throw ApiError.notFound('Education record not found');
    }

    await platformPrisma.employeeEducation.delete({ where: { id: educationId } });
    return { message: 'Education record deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Previous Employment
  // ────────────────────────────────────────────────────────────────────

  async listPrevEmployment(employeeId: string) {
    return platformPrisma.employeePrevEmployment.findMany({
      where: { employeeId },
      orderBy: { leaveDate: 'desc' },
    });
  }

  async addPrevEmployment(employeeId: string, data: any) {
    return platformPrisma.employeePrevEmployment.create({
      data: {
        employeeId,
        employerName: data.employerName,
        designation: n(data.designation),
        lastCtc: data.lastCtc ?? null,
        joinDate: data.joinDate ? new Date(data.joinDate) : null,
        leaveDate: data.leaveDate ? new Date(data.leaveDate) : null,
        reason: n(data.reason),
        experienceLetterUrl: n(data.experienceLetterUrl),
        relievingLetterUrl: n(data.relievingLetterUrl),
        previousPfAccount: n(data.previousPfAccount),
      },
    });
  }

  async updatePrevEmployment(employeeId: string, prevEmpId: string, data: any) {
    const record = await platformPrisma.employeePrevEmployment.findUnique({ where: { id: prevEmpId } });
    if (!record || record.employeeId !== employeeId) {
      throw ApiError.notFound('Previous employment record not found');
    }

    return platformPrisma.employeePrevEmployment.update({
      where: { id: prevEmpId },
      data: {
        ...(data.employerName !== undefined && { employerName: data.employerName }),
        ...(data.designation !== undefined && { designation: n(data.designation) }),
        ...(data.lastCtc !== undefined && { lastCtc: data.lastCtc ?? null }),
        ...(data.joinDate !== undefined && { joinDate: data.joinDate ? new Date(data.joinDate) : null }),
        ...(data.leaveDate !== undefined && { leaveDate: data.leaveDate ? new Date(data.leaveDate) : null }),
        ...(data.reason !== undefined && { reason: n(data.reason) }),
        ...(data.experienceLetterUrl !== undefined && { experienceLetterUrl: n(data.experienceLetterUrl) }),
        ...(data.relievingLetterUrl !== undefined && { relievingLetterUrl: n(data.relievingLetterUrl) }),
        ...(data.previousPfAccount !== undefined && { previousPfAccount: n(data.previousPfAccount) }),
      },
    });
  }

  async deletePrevEmployment(employeeId: string, prevEmpId: string) {
    const record = await platformPrisma.employeePrevEmployment.findUnique({ where: { id: prevEmpId } });
    if (!record || record.employeeId !== employeeId) {
      throw ApiError.notFound('Previous employment record not found');
    }

    await platformPrisma.employeePrevEmployment.delete({ where: { id: prevEmpId } });
    return { message: 'Previous employment record deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Documents
  // ────────────────────────────────────────────────────────────────────

  async listDocuments(employeeId: string) {
    return platformPrisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(employeeId: string, data: any, performedBy?: string) {
    const doc = await platformPrisma.employeeDocument.create({
      data: {
        employeeId,
        documentType: data.documentType,
        documentNumber: n(data.documentNumber),
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        fileUrl: data.fileUrl,
        fileName: n(data.fileName),
      },
    });

    await this.addTimelineEvent(
      employeeId,
      'DOCUMENT_UPLOADED',
      `Document Uploaded: ${data.documentType}`,
      data.fileName || data.documentType,
      { documentId: doc.id, documentType: data.documentType },
      performedBy,
    );

    return doc;
  }

  async updateDocument(employeeId: string, documentId: string, data: any) {
    const doc = await platformPrisma.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.employeeId !== employeeId) {
      throw ApiError.notFound('Document not found');
    }

    return platformPrisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        ...(data.documentType !== undefined && { documentType: data.documentType }),
        ...(data.documentNumber !== undefined && { documentNumber: n(data.documentNumber) }),
        ...(data.expiryDate !== undefined && { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null }),
        ...(data.fileUrl !== undefined && { fileUrl: data.fileUrl }),
        ...(data.fileName !== undefined && { fileName: n(data.fileName) }),
      },
    });
  }

  async deleteDocument(employeeId: string, documentId: string) {
    const doc = await platformPrisma.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.employeeId !== employeeId) {
      throw ApiError.notFound('Document not found');
    }

    await platformPrisma.employeeDocument.delete({ where: { id: documentId } });
    return { message: 'Document deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Timeline
  // ────────────────────────────────────────────────────────────────────

  async getTimeline(employeeId: string) {
    return platformPrisma.employeeTimeline.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTimelineEvent(
    employeeId: string,
    eventType: string,
    title: string,
    description?: string,
    eventData?: any,
    performedBy?: string,
  ) {
    return platformPrisma.employeeTimeline.create({
      data: {
        employeeId,
        eventType: eventType as any,
        title,
        description: description ?? null,
        eventData: eventData ? (eventData as any) : Prisma.JsonNull,
        performedBy: performedBy ?? null,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Probation Management (RED-7)
  // ────────────────────────────────────────────────────────────────────

  async listProbationDue(companyId: string) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return platformPrisma.employee.findMany({
      where: {
        companyId,
        status: 'PROBATION',
        probationEndDate: {
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { probationEndDate: 'asc' },
    });
  }

  async submitProbationReview(
    companyId: string,
    employeeId: string,
    data: { performanceRating: number; managerFeedback: string; decision: string; extensionMonths?: number },
    decidedBy?: string,
  ) {
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }
    if (employee.status !== 'PROBATION') {
      throw ApiError.badRequest('Employee is not on probation');
    }
    if (!employee.probationEndDate) {
      throw ApiError.badRequest('Employee does not have a probation end date set');
    }

    // Validate extension months when decision is EXTENDED
    if (data.decision === 'EXTENDED' && !data.extensionMonths) {
      throw ApiError.badRequest('Extension months is required when decision is EXTENDED');
    }

    return platformPrisma.$transaction(async (tx) => {
      // Calculate new probation end date for extension
      let newProbationEnd: Date | null = null;
      if (data.decision === 'EXTENDED' && data.extensionMonths) {
        newProbationEnd = new Date(employee.probationEndDate!);
        newProbationEnd.setMonth(newProbationEnd.getMonth() + data.extensionMonths);
      }

      // Create the review record
      const review = await tx.probationReview.create({
        data: {
          employeeId,
          reviewDate: new Date(),
          probationEndDate: employee.probationEndDate!,
          managerFeedback: data.managerFeedback,
          performanceRating: data.performanceRating,
          decision: data.decision,
          extensionMonths: data.extensionMonths ?? null,
          newProbationEnd,
          decidedBy: decidedBy ?? null,
          decidedAt: new Date(),
          companyId,
        },
      });

      // Update employee based on decision
      if (data.decision === 'CONFIRMED') {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            status: 'CONFIRMED',
            confirmationDate: new Date(),
          },
        });

        await tx.employeeTimeline.create({
          data: {
            employeeId,
            eventType: 'CONFIRMED' as any,
            title: 'Probation Confirmed',
            description: `Employee confirmed after probation. Rating: ${data.performanceRating}/5`,
            eventData: { reviewId: review.id, rating: data.performanceRating, feedback: data.managerFeedback } as any,
            performedBy: decidedBy ?? null,
          },
        });
      } else if (data.decision === 'EXTENDED') {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            probationEndDate: newProbationEnd,
          },
        });

        await tx.employeeTimeline.create({
          data: {
            employeeId,
            eventType: 'CUSTOM' as any,
            title: 'Probation Extended',
            description: `Probation extended by ${data.extensionMonths} month(s). New end date: ${newProbationEnd?.toISOString().split('T')[0]}`,
            eventData: { reviewId: review.id, extensionMonths: data.extensionMonths, newProbationEnd } as any,
            performedBy: decidedBy ?? null,
          },
        });
      } else if (data.decision === 'TERMINATED') {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            status: 'EXITED',
            lastWorkingDate: new Date(),
            exitReason: 'Probation termination',
          },
        });

        await tx.employeeTimeline.create({
          data: {
            employeeId,
            eventType: 'EXITED' as any,
            title: 'Probation Terminated',
            description: `Employment terminated during probation. Rating: ${data.performanceRating}/5`,
            eventData: { reviewId: review.id, rating: data.performanceRating, feedback: data.managerFeedback } as any,
            performedBy: decidedBy ?? null,
          },
        });
      }

      logger.info(`Probation review submitted for employee ${employeeId}: ${data.decision}`);
      return review;
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Org Chart (ORA-10)
  // ────────────────────────────────────────────────────────────────────

  async getOrgChart(companyId: string) {
    const employees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { not: 'EXITED' },
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        profilePhotoUrl: true,
        reportingManagerId: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        joiningDate: true,
        officialEmail: true,
        status: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    // Build tree structure
    type OrgNode = typeof employees[number] & { reportees: OrgNode[] };

    const nodeMap = new Map<string, OrgNode>();
    const roots: OrgNode[] = [];

    // First pass: create all nodes
    for (const emp of employees) {
      nodeMap.set(emp.id, { ...emp, reportees: [] });
    }

    // Second pass: link children to parents
    for (const emp of employees) {
      const node = nodeMap.get(emp.id)!;
      if (emp.reportingManagerId && nodeMap.has(emp.reportingManagerId)) {
        nodeMap.get(emp.reportingManagerId)!.reportees.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // ────────────────────────────────────────────────────────────────────
  // Anonymisation (ORA-11 — Data Retention & GDPR)
  // ────────────────────────────────────────────────────────────────────

  async anonymiseEmployee(companyId: string, employeeId: string) {
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    if (employee.status !== 'EXITED') {
      throw ApiError.badRequest('Only EXITED employees can be anonymised');
    }

    const anonSuffix = employee.id.slice(-6);

    await platformPrisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          firstName: `ANON-${anonSuffix}`,
          lastName: 'Anonymised',
          middleName: null,
          personalMobile: '0000000000',
          alternativeMobile: null,
          personalEmail: `anon-${anonSuffix}@redacted.local`,
          officialEmail: null,
          currentAddress: Prisma.JsonNull,
          permanentAddress: Prisma.JsonNull,
          emergencyContactName: 'Anonymised',
          emergencyContactRelation: 'N/A',
          emergencyContactMobile: '0000000000',
          panNumber: null,
          aadhaarNumber: null,
          bankAccountNumber: null,
          bankIfscCode: null,
          bankName: null,
          profilePhotoUrl: null,
          dateOfBirth: new Date('1900-01-01'),
        },
      });

      await tx.employeeTimeline.create({
        data: {
          employeeId,
          eventType: 'CUSTOM' as any,
          title: 'Data Anonymised',
          description: 'Data anonymised per retention policy',
          eventData: Prisma.JsonNull,
          performedBy: null,
        },
      });
    });

    logger.info(`Employee ${employeeId} anonymised in company ${companyId}`);
    return { message: 'Employee data anonymised', employeeId };
  }

  // ────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────

  private async validateReferences(companyId: string, data: any) {
    // Validate department
    if (data.departmentId) {
      const dept = await platformPrisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept || dept.companyId !== companyId) {
        throw ApiError.badRequest('Invalid department');
      }
    }

    // Validate designation
    if (data.designationId) {
      const desig = await platformPrisma.designation.findUnique({ where: { id: data.designationId } });
      if (!desig || desig.companyId !== companyId) {
        throw ApiError.badRequest('Invalid designation');
      }
    }

    // Validate employee type
    if (data.employeeTypeId) {
      const empType = await platformPrisma.employeeType.findUnique({ where: { id: data.employeeTypeId } });
      if (!empType || empType.companyId !== companyId) {
        throw ApiError.badRequest('Invalid employee type');
      }
    }

    // Validate grade (optional)
    if (data.gradeId) {
      const grade = await platformPrisma.grade.findUnique({ where: { id: data.gradeId } });
      if (!grade || grade.companyId !== companyId) {
        throw ApiError.badRequest('Invalid grade');
      }
    }

    // Validate reporting manager (optional, must be an employee in same company)
    if (data.reportingManagerId) {
      const manager = await platformPrisma.employee.findUnique({ where: { id: data.reportingManagerId } });
      if (!manager || manager.companyId !== companyId) {
        throw ApiError.badRequest('Invalid reporting manager');
      }
    }

    // Validate functional manager (optional)
    if (data.functionalManagerId) {
      const manager = await platformPrisma.employee.findUnique({ where: { id: data.functionalManagerId } });
      if (!manager || manager.companyId !== companyId) {
        throw ApiError.badRequest('Invalid functional manager');
      }
    }

    // Validate shift (optional)
    if (data.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({ where: { id: data.shiftId } });
      if (!shift || shift.companyId !== companyId) {
        throw ApiError.badRequest('Invalid shift');
      }
    }

    // Validate cost centre (optional)
    if (data.costCentreId) {
      const cc = await platformPrisma.costCentre.findUnique({ where: { id: data.costCentreId } });
      if (!cc || cc.companyId !== companyId) {
        throw ApiError.badRequest('Invalid cost centre');
      }
    }

    // Validate location (optional)
    if (data.locationId) {
      const loc = await platformPrisma.location.findUnique({ where: { id: data.locationId } });
      if (!loc || loc.companyId !== companyId) {
        throw ApiError.badRequest('Invalid location');
      }
    }
  }
}

export const employeeService = new EmployeeService();
