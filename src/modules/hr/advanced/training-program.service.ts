import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import {
  validateTransition,
  PROGRAM_ENROLLMENT_TRANSITIONS,
} from '../../../shared/utils/state-machine';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
}

interface ProgramListOptions extends ListOptions {
  category?: string;
  isActive?: boolean;
}

class TrainingProgramService {
  // ════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════

  async listPrograms(companyId: string, options: ProgramListOptions = {}) {
    const { page = 1, limit = 25, category, isActive } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive;

    const [programs, total] = await Promise.all([
      platformPrisma.trainingProgram.findMany({
        where,
        include: {
          _count: { select: { courses: true, enrollments: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.trainingProgram.count({ where }),
    ]);

    return { programs, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════════════════════

  async getProgram(companyId: string, id: string) {
    const program = await platformPrisma.trainingProgram.findUnique({
      where: { id },
      include: {
        courses: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            training: { select: { id: true, name: true, type: true, mode: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });

    if (!program || program.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }

    return program;
  }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createProgram(companyId: string, data: any) {
    const programNumber = await generateNextNumber(
      platformPrisma, companyId, ['Training Program'], 'Training Program',
    );

    const program = await platformPrisma.trainingProgram.create({
      data: {
        companyId,
        programNumber,
        name: data.name,
        description: n(data.description),
        category: data.category,
        level: n(data.level),
        totalDuration: n(data.totalDuration),
        isCompulsory: data.isCompulsory ?? false,
      },
      include: {
        _count: { select: { courses: true, enrollments: true } },
      },
    });

    return program;
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════

  async updateProgram(companyId: string, id: string, data: any) {
    const existing = await platformPrisma.trainingProgram.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = n(data.description);
    if (data.category !== undefined) updateData.category = data.category;
    if (data.level !== undefined) updateData.level = n(data.level);
    if (data.totalDuration !== undefined) updateData.totalDuration = n(data.totalDuration);
    if (data.isCompulsory !== undefined) updateData.isCompulsory = data.isCompulsory;

    const program = await platformPrisma.trainingProgram.update({
      where: { id },
      data: updateData,
      include: {
        courses: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            training: { select: { id: true, name: true, type: true, mode: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });

    return program;
  }

  // ════════════════════════════════════════════════════════════════
  // DELETE
  // ════════════════════════════════════════════════════════════════

  async deleteProgram(companyId: string, id: string) {
    const existing = await platformPrisma.trainingProgram.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }
    if (existing._count.enrollments > 0) {
      throw ApiError.badRequest('Cannot delete program with existing enrollments');
    }

    await platformPrisma.trainingProgram.delete({ where: { id } });
    return { message: 'Training program deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // ADD COURSE
  // ════════════════════════════════════════════════════════════════

  async addCourse(companyId: string, programId: string, data: any) {
    const program = await platformPrisma.trainingProgram.findUnique({ where: { id: programId } });
    if (!program || program.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }

    // Validate training exists
    const training = await platformPrisma.trainingCatalogue.findUnique({ where: { id: data.trainingId } });
    if (!training || training.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }

    // Check for duplicate (@@unique([programId, trainingId]))
    const existing = await platformPrisma.trainingProgramCourse.findUnique({
      where: { programId_trainingId: { programId, trainingId: data.trainingId } },
    });
    if (existing) {
      throw ApiError.badRequest('This training is already added to the program');
    }

    const course = await platformPrisma.trainingProgramCourse.create({
      data: {
        companyId,
        programId,
        trainingId: data.trainingId,
        sequenceOrder: data.sequenceOrder,
        isPrerequisite: data.isPrerequisite ?? false,
        minPassScore: n(data.minPassScore),
      },
      include: {
        training: { select: { id: true, name: true, type: true, mode: true } },
      },
    });

    return course;
  }

  // ════════════════════════════════════════════════════════════════
  // REMOVE COURSE
  // ════════════════════════════════════════════════════════════════

  async removeCourse(companyId: string, programId: string, courseId: string) {
    const course = await platformPrisma.trainingProgramCourse.findUnique({
      where: { id: courseId },
    });
    if (!course || course.companyId !== companyId || course.programId !== programId) {
      throw ApiError.notFound('Program course not found');
    }

    // Check if any enrollments are IN_PROGRESS or COMPLETED
    const activeEnrollments = await platformPrisma.trainingProgramEnrollment.count({
      where: {
        programId,
        companyId,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
    });
    if (activeEnrollments > 0) {
      throw ApiError.badRequest('Cannot remove course while enrollments are in progress or completed');
    }

    await platformPrisma.trainingProgramCourse.delete({ where: { id: courseId } });
    return { message: 'Course removed from program' };
  }

  // ════════════════════════════════════════════════════════════════
  // ENROLL EMPLOYEES
  // ════════════════════════════════════════════════════════════════

  async enrollEmployees(companyId: string, programId: string, data: { employeeIds: string[] }) {
    const program = await platformPrisma.trainingProgram.findUnique({ where: { id: programId } });
    if (!program || program.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }

    // Get existing enrollments to skip duplicates
    const existingEnrollments = await platformPrisma.trainingProgramEnrollment.findMany({
      where: { programId, companyId, employeeId: { in: data.employeeIds } },
      select: { employeeId: true },
    });
    const existingIds = new Set(existingEnrollments.map((e) => e.employeeId));

    const newEmployeeIds = data.employeeIds.filter((id) => !existingIds.has(id));
    if (newEmployeeIds.length === 0) {
      return { enrolled: 0, skipped: data.employeeIds.length, message: 'All employees are already enrolled' };
    }

    // Validate employees exist
    const employees = await platformPrisma.employee.findMany({
      where: { id: { in: newEmployeeIds }, companyId },
      select: { id: true },
    });
    const validIds = new Set(employees.map((e) => e.id));

    const createData = newEmployeeIds
      .filter((id) => validIds.has(id))
      .map((employeeId) => ({
        companyId,
        programId,
        employeeId,
        status: 'ENROLLED' as const,
        progressPercent: 0,
      }));

    await platformPrisma.trainingProgramEnrollment.createMany({ data: createData });

    return {
      enrolled: createData.length,
      skipped: data.employeeIds.length - createData.length,
      message: `${createData.length} employee(s) enrolled successfully`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // LIST ENROLLMENTS
  // ════════════════════════════════════════════════════════════════

  async listEnrollments(companyId: string, programId: string) {
    const program = await platformPrisma.trainingProgram.findUnique({ where: { id: programId } });
    if (!program || program.companyId !== companyId) {
      throw ApiError.notFound('Training program not found');
    }

    const enrollments = await platformPrisma.trainingProgramEnrollment.findMany({
      where: { programId, companyId },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    return enrollments;
  }

  // ════════════════════════════════════════════════════════════════
  // RECALCULATE PROGRESS
  // ════════════════════════════════════════════════════════════════

  async recalculateProgress(companyId: string, enrollmentId: string) {
    const enrollment = await platformPrisma.trainingProgramEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        program: {
          include: {
            courses: { select: { trainingId: true } },
          },
        },
      },
    });

    if (!enrollment || enrollment.companyId !== companyId) {
      throw ApiError.notFound('Enrollment not found');
    }

    const totalCourses = enrollment.program.courses.length;
    if (totalCourses === 0) return enrollment;

    // Count completed nominations for trainings in this program
    const trainingIds = enrollment.program.courses.map((c) => c.trainingId);

    const completedCount = await platformPrisma.trainingNomination.count({
      where: {
        companyId,
        employeeId: enrollment.employeeId,
        trainingId: { in: trainingIds },
        status: 'COMPLETED',
      },
    });

    const progressPercent = Math.round((completedCount / totalCourses) * 100);

    const updateData: any = { progressPercent };

    // If all courses completed, auto-complete the enrollment
    if (completedCount >= totalCourses) {
      // Only transition if current status allows it
      const currentStatus = enrollment.status;
      if (currentStatus !== 'COMPLETED') {
        // Ensure we can transition to COMPLETED
        const targetStatus = 'COMPLETED';
        // For auto-completion, we transition through IN_PROGRESS if currently ENROLLED
        if (currentStatus === 'ENROLLED') {
          validateTransition(currentStatus, 'IN_PROGRESS', PROGRAM_ENROLLMENT_TRANSITIONS, 'program enrollment');
          // Then complete
          validateTransition('IN_PROGRESS', targetStatus, PROGRAM_ENROLLMENT_TRANSITIONS, 'program enrollment');
        } else {
          validateTransition(currentStatus, targetStatus, PROGRAM_ENROLLMENT_TRANSITIONS, 'program enrollment');
        }
        updateData.status = targetStatus;
        updateData.completedAt = new Date();
      }
    } else if (completedCount > 0 && enrollment.status === 'ENROLLED') {
      // Move to IN_PROGRESS once at least one course is completed
      validateTransition(enrollment.status, 'IN_PROGRESS', PROGRAM_ENROLLMENT_TRANSITIONS, 'program enrollment');
      updateData.status = 'IN_PROGRESS';
    }

    const updated = await platformPrisma.trainingProgramEnrollment.update({
      where: { id: enrollmentId },
      data: updateData,
    });

    return updated;
  }

  // ════════════════════════════════════════════════════════════════
  // PREREQUISITE VALIDATION (helper for nomination creation)
  // ════════════════════════════════════════════════════════════════

  async validatePrerequisites(companyId: string, employeeId: string, trainingId: string) {
    // Find all program courses that include this training
    const programCourses = await platformPrisma.trainingProgramCourse.findMany({
      where: { trainingId, companyId },
      include: {
        program: {
          include: {
            courses: {
              where: { isPrerequisite: true },
              orderBy: { sequenceOrder: 'asc' },
              include: {
                training: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    for (const pc of programCourses) {
      // Get prerequisite courses with lower sequence order than this course
      const prerequisites = pc.program.courses.filter(
        (c) => c.sequenceOrder < pc.sequenceOrder && c.isPrerequisite,
      );

      if (prerequisites.length === 0) continue;

      // Check if employee has completed all prerequisite trainings
      const prerequisiteTrainingIds = prerequisites.map((p) => p.trainingId);
      const completedCount = await platformPrisma.trainingNomination.count({
        where: {
          companyId,
          employeeId,
          trainingId: { in: prerequisiteTrainingIds },
          status: 'COMPLETED',
        },
      });

      if (completedCount < prerequisites.length) {
        const incomplete = prerequisites
          .map((p) => p.training.name)
          .join(', ');
        throw ApiError.badRequest(
          `Employee must complete prerequisite course(s) first: ${incomplete} (in program "${pc.program.name}")`,
        );
      }
    }
  }
}

export const trainingProgramService = new TrainingProgramService();
