import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { hashPassword } from '../../shared/utils';
import { logger } from '../../config/logger';

export class PlatformUsersService {
  // ────────────────────────────────────────────────────────────────────
  // List all users across all companies (paginated, filterable)
  // ────────────────────────────────────────────────────────────────────
  async listUsers(options: {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    companyId?: string | undefined;
    role?: string | undefined;
    isActive?: boolean | undefined;
  } = {}) {
    const { page = 1, limit = 25, search, companyId, role, isActive } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (role) {
      where.role = role;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      platformPrisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
          companyId: true,
          employeeId: true,
          mfaEnabled: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          company: { select: { id: true, name: true } },
          tenantUsers: {
            select: {
              roleId: true,
              role: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.user.count({ where }),
    ]);

    const enriched = users.map((u) => {
      const tu = u.tenantUsers[0];
      return {
        ...u,
        tenantUsers: undefined,
        companyName: u.company?.name ?? null,
        tenantRoleId: tu?.role?.id ?? null,
        tenantRoleName: tu?.role?.name ?? null,
      };
    });

    return { users: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get single user by ID
  // ────────────────────────────────────────────────────────────────────
  async getUserById(userId: string) {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
        employeeId: true,
        mfaEnabled: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        company: { select: { id: true, name: true } },
        tenantUsers: {
          select: {
            id: true,
            tenantId: true,
            roleId: true,
            isActive: true,
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const tu = user.tenantUsers[0];
    return {
      ...user,
      tenantUsers: undefined,
      companyName: user.company?.name ?? null,
      tenantRoleId: tu?.role?.id ?? null,
      tenantRoleName: tu?.role?.name ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Create a new user (super admin can assign to any company)
  // ────────────────────────────────────────────────────────────────────
  async createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
    companyId: string;
    role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'USER';
  }) {
    const existing = await platformPrisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw ApiError.conflict(`Email "${data.email}" is already in use`);
    }

    // Validate company exists
    const company = await platformPrisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true, name: true, tenant: { select: { id: true } } },
    });
    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    const hashed = await hashPassword(data.password);

    const result = await platformPrisma.$transaction(async (tx) => {
      // Auto-link employee if email matches
      let employeeId: string | null = null;
      const existingEmployee = await tx.employee.findFirst({
        where: { companyId: data.companyId, officialEmail: data.email },
        select: { id: true },
      });
      if (existingEmployee) {
        const alreadyLinked = await tx.user.findUnique({
          where: { employeeId: existingEmployee.id },
          select: { id: true },
        });
        if (!alreadyLinked) {
          employeeId = existingEmployee.id;
        }
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashed,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          role: data.role,
          companyId: data.companyId,
          employeeId,
        },
      });

      // Create TenantUser bridge for non-super-admin users
      if (data.role !== 'SUPER_ADMIN' && company.tenant?.id) {
        const defaultRole = await tx.role.findFirst({
          where: {
            tenantId: company.tenant.id,
            isSystem: true,
            name: data.role === 'COMPANY_ADMIN' ? 'Company Admin' : 'Employee',
          },
        });
        if (defaultRole) {
          await tx.tenantUser.create({
            data: {
              userId: user.id,
              tenantId: company.tenant.id,
              roleId: defaultRole.id,
            },
          });
        }
      }

      return user;
    });

    logger.info(`Platform user created by super admin: ${result.id} (${result.email}) for company ${data.companyId}`);

    return this.getUserById(result.id);
  }

  // ────────────────────────────────────────────────────────────────────
  // Update user details
  // ────────────────────────────────────────────────────────────────────
  async updateUser(userId: string, data: {
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    phone?: string | null | undefined;
    companyId?: string | undefined;
    role?: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'USER' | undefined;
  }) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== user.email) {
      const existing = await platformPrisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        throw ApiError.conflict(`Email "${data.email}" is already in use`);
      }
    }

    // Validate new company if changing
    if (data.companyId && data.companyId !== user.companyId) {
      const company = await platformPrisma.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
      if (!company) {
        throw ApiError.notFound('Target company not found');
      }
    }

    await platformPrisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.role !== undefined && { role: data.role }),
      },
    });

    logger.info(`Platform user ${userId} updated by super admin`);
    return this.getUserById(userId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Reset user password (super admin)
  // ────────────────────────────────────────────────────────────────────
  async resetPassword(userId: string, newPassword: string) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const hashed = await hashPassword(newPassword);
    await platformPrisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    logger.info(`Platform user ${userId} password reset by super admin`);
    return { message: 'Password reset successfully' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Toggle user active status
  // ────────────────────────────────────────────────────────────────────
  async updateStatus(userId: string, isActive: boolean) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.role === 'SUPER_ADMIN') {
      throw ApiError.badRequest('Cannot deactivate a super admin account');
    }

    await platformPrisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    logger.info(`Platform user ${userId} status set to ${isActive ? 'active' : 'inactive'} by super admin`);
    return this.getUserById(userId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Delete user permanently
  // ────────────────────────────────────────────────────────────────────
  async deleteUser(userId: string) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.role === 'SUPER_ADMIN') {
      throw ApiError.badRequest('Cannot delete a super admin account');
    }

    await platformPrisma.$transaction(async (tx) => {
      // Remove tenant user bridges
      await tx.tenantUser.deleteMany({ where: { userId } });
      // Remove active sessions
      await tx.activeSession.deleteMany({ where: { userId } });
      // Remove password reset tokens
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      // Remove the user
      await tx.user.delete({ where: { id: userId } });
    });

    logger.info(`Platform user ${userId} (${user.email}) permanently deleted by super admin`);
    return { message: 'User deleted successfully' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get aggregate stats for dashboard cards
  // ────────────────────────────────────────────────────────────────────
  async getStats() {
    const [total, active, inactive, superAdmins, companyAdmins, regularUsers, companies] = await Promise.all([
      platformPrisma.user.count(),
      platformPrisma.user.count({ where: { isActive: true } }),
      platformPrisma.user.count({ where: { isActive: false } }),
      platformPrisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
      platformPrisma.user.count({ where: { role: 'COMPANY_ADMIN' } }),
      platformPrisma.user.count({ where: { role: 'USER' } }),
      platformPrisma.company.count(),
    ]);

    return { total, active, inactive, superAdmins, companyAdmins, regularUsers, companies };
  }

  // ────────────────────────────────────────────────────────────────────
  // List companies (for dropdown filter)
  // ────────────────────────────────────────────────────────────────────
  async listCompanies() {
    const companies = await platformPrisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return companies;
  }
}

export const platformUsersService = new PlatformUsersService();
