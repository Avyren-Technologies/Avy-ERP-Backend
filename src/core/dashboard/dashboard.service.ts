import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

export class DashboardService {
  // ────────────────────────────────────────────────────────────────────
  // Super Admin dashboard KPIs
  // ────────────────────────────────────────────────────────────────────
  async getSuperAdminStats() {
    const [
      companiesByStatus,
      totalUsers,
      subscriptionData,
      activeModulesData,
    ] = await Promise.all([
      // Count companies by wizardStatus
      platformPrisma.company.groupBy({
        by: ['wizardStatus'],
        _count: { wizardStatus: true },
      }),

      // Count total users
      platformPrisma.user.count(),

      // Sum subscription amounts for MRR (from active subscriptions' latest paid invoices)
      platformPrisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PAID',
          subscription: { status: { in: ['ACTIVE', 'TRIAL'] } },
          // Only count invoices from the current month for MRR
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),

      // Count unique active modules across all companies
      platformPrisma.company.findMany({
        where: { wizardStatus: { not: 'Inactive' } },
        select: { selectedModuleIds: true },
      }),
    ]);

    // Parse company status counts
    const tenantOverview = { active: 0, trial: 0, suspended: 0, expired: 0 };
    let activeCompanies = 0;

    companiesByStatus.forEach((group) => {
      const count = group._count.wizardStatus;
      switch (group.wizardStatus) {
        case 'Active':
          tenantOverview.active = count;
          activeCompanies = count;
          break;
        case 'Pilot':
        case 'Draft':
          tenantOverview.trial += count;
          break;
        case 'Inactive':
          tenantOverview.suspended = count;
          break;
      }
    });

    // Count unique module IDs across all companies
    const moduleIdSet = new Set<string>();
    activeModulesData.forEach((company) => {
      const ids = company.selectedModuleIds as string[] | null;
      if (Array.isArray(ids)) {
        ids.forEach((id) => moduleIdSet.add(id));
      }
    });

    const monthlyRevenue = subscriptionData._sum.amount ?? 0;

    return {
      activeCompanies,
      totalUsers,
      monthlyRevenue,
      activeModules: moduleIdSet.size,
      tenantOverview,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Recent activity from audit logs
  // ────────────────────────────────────────────────────────────────────
  async getRecentActivity(limit = 10) {
    const activities = await platformPrisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return activities;
  }

  // ────────────────────────────────────────────────────────────────────
  // Revenue metrics for charts (last 6 months)
  // ────────────────────────────────────────────────────────────────────
  async getRevenueMetrics() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const invoices = await platformPrisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: sixMonthsAgo },
      },
      select: {
        amount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    // Group by month
    const monthMap = new Map<string, number>();

    // Pre-fill last 6 months with 0
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, 0);
    }

    invoices.forEach((inv) => {
      if (inv.paidAt) {
        const key = `${inv.paidAt.getFullYear()}-${String(inv.paidAt.getMonth() + 1).padStart(2, '0')}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + inv.amount);
      }
    });

    const months = Array.from(monthMap.entries()).map(([month, revenue]) => ({
      month,
      revenue,
    }));

    return { months };
  }

  // ────────────────────────────────────────────────────────────────────
  // Company Admin dashboard KPIs (tenant-scoped)
  // ────────────────────────────────────────────────────────────────────
  async getCompanyAdminStats(companyId: string) {
    const [usersCount, locationsCount, shiftsCount, contactsCount, noSeriesCount, iotReasonsCount, company] = await Promise.all([
      platformPrisma.user.count({ where: { companyId } }),
      platformPrisma.location.count({ where: { companyId } }),
      platformPrisma.companyShift.count({ where: { companyId } }),
      platformPrisma.companyContact.count({ where: { companyId } }),
      platformPrisma.noSeriesConfig.count({ where: { companyId } }),
      platformPrisma.iotReason.count({ where: { companyId } }),
      platformPrisma.company.findUnique({
        where: { id: companyId },
        select: { selectedModuleIds: true, locationConfig: true, wizardStatus: true, displayName: true, tenant: { select: { id: true } } },
      }),
    ]);

    // When locationConfig is 'per-location', modules are stored on each Location
    // rather than on Company.selectedModuleIds — aggregate from all locations
    let moduleIds: string[] = [];
    if (company?.locationConfig === 'per-location') {
      const locations = await platformPrisma.location.findMany({
        where: { companyId },
        select: { moduleIds: true },
      });
      const moduleIdSet = new Set<string>();
      locations.forEach((loc) => {
        const ids = loc.moduleIds as string[] | null;
        if (Array.isArray(ids)) {
          ids.forEach((id) => moduleIdSet.add(id));
        }
      });
      moduleIds = Array.from(moduleIdSet);
    } else {
      moduleIds = (company?.selectedModuleIds as string[] | null) ?? [];
    }

    return {
      companyName: company?.displayName ?? '',
      wizardStatus: company?.wizardStatus ?? 'Draft',
      totalUsers: usersCount,
      totalLocations: locationsCount,
      shiftsCount,
      contactsCount,
      noSeriesCount,
      iotReasonsCount,
      activeModules: moduleIds.length,
      moduleIds,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Company Admin recent activity (tenant-scoped audit logs)
  // ────────────────────────────────────────────────────────────────────
  async getCompanyAdminActivity(companyId: string, limit = 10) {
    // Resolve tenantId from companyId
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      select: { id: true },
    });

    if (!tenant) {
      return [];
    }

    const activities = await platformPrisma.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return activities;
  }
}

export const dashboardService = new DashboardService();
