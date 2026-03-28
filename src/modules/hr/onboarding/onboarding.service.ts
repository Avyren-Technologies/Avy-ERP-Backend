import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';

export class OnboardingService {
  // ────────────────────────────────────────────────────────────────────
  // Template CRUD
  // ────────────────────────────────────────────────────────────────────

  async listTemplates(companyId: string) {
    const templates = await platformPrisma.onboardingTemplate.findMany({
      where: { companyId },
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => ({
      ...t,
      taskCount: t._count.tasks,
      _count: undefined,
    }));
  }

  async getTemplate(companyId: string, id: string) {
    const template = await platformPrisma.onboardingTemplate.findUnique({
      where: { id },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Onboarding template not found');
    }

    return template;
  }

  async createTemplate(companyId: string, data: { name: string; items: any[]; isDefault?: boolean }) {
    // Check unique name within company
    const existing = await platformPrisma.onboardingTemplate.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Template with name "${data.name}" already exists`);
    }

    // If isDefault, unset other defaults
    if (data.isDefault) {
      await platformPrisma.onboardingTemplate.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await platformPrisma.onboardingTemplate.create({
      data: {
        companyId,
        name: data.name,
        items: data.items as any,
        isDefault: data.isDefault ?? false,
      },
    });

    logger.info(`Onboarding template created: ${template.id} for company ${companyId}`);
    return template;
  }

  async updateTemplate(companyId: string, id: string, data: { name?: string; items?: any[]; isDefault?: boolean }) {
    const existing = await platformPrisma.onboardingTemplate.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Onboarding template not found');
    }

    // Check unique name if name is being changed
    if (data.name && data.name !== existing.name) {
      const dup = await platformPrisma.onboardingTemplate.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (dup) {
        throw ApiError.conflict(`Template with name "${data.name}" already exists`);
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await platformPrisma.onboardingTemplate.updateMany({
        where: { companyId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.items !== undefined) updateData.items = data.items as any;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

    return platformPrisma.onboardingTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteTemplate(companyId: string, id: string) {
    const existing = await platformPrisma.onboardingTemplate.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Onboarding template not found');
    }

    // Check no active tasks reference this template
    const activeTasks = await platformPrisma.onboardingTask.count({
      where: { templateId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (activeTasks > 0) {
      throw ApiError.badRequest(
        `Cannot delete template: ${activeTasks} active task(s) still reference it`
      );
    }

    await platformPrisma.onboardingTemplate.delete({ where: { id } });
    logger.info(`Onboarding template deleted: ${id} for company ${companyId}`);
    return { message: 'Template deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Task Management
  // ────────────────────────────────────────────────────────────────────

  async generateTasksForEmployee(companyId: string, employeeId: string, templateId?: string) {
    // Validate employee exists
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, joiningDate: true, firstName: true, lastName: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Find template
    let template;
    if (templateId) {
      template = await platformPrisma.onboardingTemplate.findUnique({ where: { id: templateId } });
      if (!template || template.companyId !== companyId) {
        throw ApiError.notFound('Onboarding template not found');
      }
    } else {
      template = await platformPrisma.onboardingTemplate.findFirst({
        where: { companyId, isDefault: true },
      });
      if (!template) {
        throw ApiError.badRequest('No default onboarding template found. Please create one or specify a template ID.');
      }
    }

    const items = template.items as any[];
    const joiningDate = new Date(employee.joiningDate);

    const tasks = items.map((item) => ({
      employeeId,
      templateId: template!.id,
      title: item.title,
      department: item.department,
      description: item.description ?? null,
      dueDate: item.dueInDays ? new Date(joiningDate.getTime() + item.dueInDays * 86400000) : null,
      isMandatory: item.isMandatory ?? true,
      status: 'PENDING',
      companyId,
    }));

    if (tasks.length > 0) {
      await platformPrisma.onboardingTask.createMany({ data: tasks });
    }

    logger.info(`Generated ${tasks.length} onboarding tasks for employee ${employeeId} from template ${template.id}`);

    // Return the created tasks
    return platformPrisma.onboardingTask.findMany({
      where: { employeeId, templateId: template.id },
      orderBy: { dueDate: 'asc' },
    });
  }

  async listTasksForEmployee(
    companyId: string,
    employeeId: string,
    options?: { department?: string; status?: string },
  ) {
    const where: any = { companyId, employeeId };
    if (options?.department) where.department = options.department;
    if (options?.status) where.status = options.status;

    return platformPrisma.onboardingTask.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });
  }

  async listAllTasks(companyId: string, options?: { department?: string; status?: string }) {
    const where: any = { companyId };
    if (options?.department) where.department = options.department;
    if (options?.status) where.status = options.status;

    return platformPrisma.onboardingTask.findMany({
      where,
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async updateTask(companyId: string, taskId: string, data: { status: string; notes?: string }, completedBy?: string) {
    const task = await platformPrisma.onboardingTask.findUnique({ where: { id: taskId } });
    if (!task || task.companyId !== companyId) {
      throw ApiError.notFound('Onboarding task not found');
    }

    const updateData: any = {
      status: data.status,
    };
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.status === 'COMPLETED') {
      updateData.completedAt = new Date();
      updateData.completedBy = completedBy ?? null;
    }

    return platformPrisma.onboardingTask.update({
      where: { id: taskId },
      data: updateData,
    });
  }

  async getOnboardingProgress(companyId: string, employeeId: string) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    const tasks = await platformPrisma.onboardingTask.findMany({
      where: { companyId, employeeId },
      select: { department: true, status: true },
    });

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const pending = tasks.filter((t) => t.status === 'PENDING').length;
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const skipped = tasks.filter((t) => t.status === 'SKIPPED').length;

    // Group by department
    const byDepartment: Record<string, { total: number; completed: number; pending: number }> = {};
    for (const task of tasks) {
      if (!byDepartment[task.department]) {
        byDepartment[task.department] = { total: 0, completed: 0, pending: 0 };
      }
      const dept = byDepartment[task.department];
      if (dept) {
        dept.total++;
        if (task.status === 'COMPLETED') dept.completed++;
        if (task.status === 'PENDING') dept.pending++;
      }
    }

    return { total, completed, pending, inProgress, skipped, byDepartment };
  }
}

export const onboardingService = new OnboardingService();
