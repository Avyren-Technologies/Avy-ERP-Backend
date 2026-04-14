import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors';

type UpdateVerdict = 'force' | 'soft' | 'none';

interface VersionCheckResult {
  updateRequired: UpdateVerdict;
  currentVersion: string;
  latestVersion: string;
  minimumVersion: string;
  recommendedVersion: string | null;
  updateUrl: string | null;
  maintenanceMode: boolean;
  message: string;
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b,  0 if a === b,  1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

class AppVersionService {
  /**
   * Public check — no auth required.
   * Called by mobile/web clients on cold start.
   */
  async checkVersion(platform: string, clientVersion: string): Promise<VersionCheckResult> {
    const config = await platformPrisma.appVersionConfig.findUnique({
      where: { platform },
    });

    // No config for this platform — allow through
    if (!config || !config.isActive) {
      return {
        updateRequired: 'none',
        currentVersion: clientVersion,
        latestVersion: clientVersion,
        minimumVersion: '0.0.0',
        recommendedVersion: null,
        updateUrl: null,
        maintenanceMode: false,
        message: 'App is up to date',
      };
    }

    // Maintenance mode overrides everything
    if (config.maintenanceMode) {
      logger.warn('App version check blocked by maintenance mode', { platform, clientVersion });
      return {
        updateRequired: 'force',
        currentVersion: clientVersion,
        latestVersion: config.latestVersion,
        minimumVersion: config.minimumVersion,
        recommendedVersion: config.recommendedVersion,
        updateUrl: config.updateUrl,
        maintenanceMode: true,
        message: config.maintenanceMessage ?? 'The app is currently under maintenance. Please try again later.',
      };
    }

    let verdict: UpdateVerdict = 'none';
    let message = 'App is up to date';

    // Force update: client < minimum
    if (compareSemver(clientVersion, config.minimumVersion) < 0) {
      verdict = 'force';
      message = `Your app version (${clientVersion}) is no longer supported. Please update to version ${config.latestVersion} to continue.`;
      logger.info('Force update required', { platform, clientVersion, minimumVersion: config.minimumVersion });
    }
    // Soft update: client < recommended (but >= minimum)
    else if (
      config.recommendedVersion &&
      compareSemver(clientVersion, config.recommendedVersion) < 0
    ) {
      verdict = 'soft';
      message = `A new version (${config.latestVersion}) is available with improvements and bug fixes.`;
    }

    return {
      updateRequired: verdict,
      currentVersion: clientVersion,
      latestVersion: config.latestVersion,
      minimumVersion: config.minimumVersion,
      recommendedVersion: config.recommendedVersion,
      updateUrl: config.updateUrl,
      maintenanceMode: false,
      message,
    };
  }

  // ── Admin CRUD ──────────────────────────────────────────────

  async list() {
    return platformPrisma.appVersionConfig.findMany({
      orderBy: { platform: 'asc' },
    });
  }

  async getByPlatform(platform: string) {
    return platformPrisma.appVersionConfig.findUnique({
      where: { platform },
    });
  }

  async upsert(
    platform: string,
    data: {
      latestVersion: string;
      minimumVersion: string;
      recommendedVersion?: string | undefined;
      updateUrl?: string | undefined;
      maintenanceMode?: boolean | undefined;
      maintenanceMessage?: string | undefined;
      isActive?: boolean | undefined;
    },
  ) {
    // Validate: minimumVersion <= recommendedVersion <= latestVersion
    if (compareSemver(data.minimumVersion, data.latestVersion) > 0) {
      throw ApiError.badRequest('minimumVersion cannot be greater than latestVersion');
    }
    if (
      data.recommendedVersion &&
      compareSemver(data.recommendedVersion, data.latestVersion) > 0
    ) {
      throw ApiError.badRequest('recommendedVersion cannot be greater than latestVersion');
    }
    if (
      data.recommendedVersion &&
      compareSemver(data.minimumVersion, data.recommendedVersion) > 0
    ) {
      throw ApiError.badRequest('minimumVersion cannot be greater than recommendedVersion');
    }

    const result = await platformPrisma.appVersionConfig.upsert({
      where: { platform },
      create: {
        platform,
        latestVersion: data.latestVersion,
        minimumVersion: data.minimumVersion,
        recommendedVersion: data.recommendedVersion ?? null,
        updateUrl: data.updateUrl ?? null,
        maintenanceMode: data.maintenanceMode ?? false,
        maintenanceMessage: data.maintenanceMessage ?? null,
        isActive: data.isActive ?? true,
      },
      update: {
        latestVersion: data.latestVersion,
        minimumVersion: data.minimumVersion,
        recommendedVersion: data.recommendedVersion ?? null,
        updateUrl: data.updateUrl ?? null,
        maintenanceMode: data.maintenanceMode ?? false,
        maintenanceMessage: data.maintenanceMessage ?? null,
        isActive: data.isActive ?? true,
      },
    });

    logger.info('App version config upserted', { platform, latestVersion: data.latestVersion, minimumVersion: data.minimumVersion });
    return result;
  }

  async update(
    id: string,
    data: {
      latestVersion?: string | undefined;
      minimumVersion?: string | undefined;
      recommendedVersion?: string | undefined;
      updateUrl?: string | undefined;
      maintenanceMode?: boolean | undefined;
      maintenanceMessage?: string | undefined;
      isActive?: boolean | undefined;
    },
  ) {
    const existing = await platformPrisma.appVersionConfig.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('App version config not found');

    // Merge with existing for cross-field validation
    const merged = {
      latestVersion: data.latestVersion ?? existing.latestVersion,
      minimumVersion: data.minimumVersion ?? existing.minimumVersion,
      recommendedVersion: data.recommendedVersion ?? existing.recommendedVersion,
    };

    if (compareSemver(merged.minimumVersion, merged.latestVersion) > 0) {
      throw ApiError.badRequest('minimumVersion cannot be greater than latestVersion');
    }
    if (
      merged.recommendedVersion &&
      compareSemver(merged.recommendedVersion, merged.latestVersion) > 0
    ) {
      throw ApiError.badRequest('recommendedVersion cannot be greater than latestVersion');
    }
    if (
      merged.recommendedVersion &&
      compareSemver(merged.minimumVersion, merged.recommendedVersion) > 0
    ) {
      throw ApiError.badRequest('minimumVersion cannot be greater than recommendedVersion');
    }

    // Build update payload — only include fields that were explicitly provided.
    // This avoids passing `undefined` which conflicts with exactOptionalPropertyTypes.
    const updateData: Record<string, unknown> = {};
    if (data.latestVersion !== undefined) updateData.latestVersion = data.latestVersion;
    if (data.minimumVersion !== undefined) updateData.minimumVersion = data.minimumVersion;
    if (data.recommendedVersion !== undefined) updateData.recommendedVersion = data.recommendedVersion ?? null;
    if (data.updateUrl !== undefined) updateData.updateUrl = data.updateUrl ?? null;
    if (data.maintenanceMode !== undefined) updateData.maintenanceMode = data.maintenanceMode;
    if (data.maintenanceMessage !== undefined) updateData.maintenanceMessage = data.maintenanceMessage ?? null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return platformPrisma.appVersionConfig.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    const existing = await platformPrisma.appVersionConfig.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('App version config not found');
    logger.info('App version config deleted', { id, platform: existing.platform });
    return platformPrisma.appVersionConfig.delete({ where: { id } });
  }
}

export const appVersionService = new AppVersionService();
