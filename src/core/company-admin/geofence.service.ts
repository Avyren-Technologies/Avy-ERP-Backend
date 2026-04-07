import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors';

class GeofenceService {
  // ── List all geofences for a location ───────────────────────────────
  async listGeofences(companyId: string, locationId: string) {
    const location = await platformPrisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, companyId: true },
    });
    if (!location || location.companyId !== companyId) {
      throw ApiError.notFound('Location not found');
    }

    return platformPrisma.geofence.findMany({
      where: { locationId, companyId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { employees: true } } },
    });
  }

  // ── Get single geofence ─────────────────────────────────────────────
  async getGeofence(companyId: string, id: string) {
    const geofence = await platformPrisma.geofence.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!geofence || geofence.companyId !== companyId) {
      throw ApiError.notFound('Geofence not found');
    }
    return geofence;
  }

  // ── Create geofence ─────────────────────────────────────────────────
  async createGeofence(
    companyId: string,
    locationId: string,
    data: {
      name: string;
      lat: number;
      lng: number;
      radius?: number | undefined;
      address?: string | undefined;
      isDefault?: boolean | undefined;
    },
  ) {
    // Verify location belongs to company
    const location = await platformPrisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, companyId: true },
    });
    if (!location || location.companyId !== companyId) {
      throw ApiError.notFound('Location not found');
    }

    // Enforce max 20 geofences per location
    const existingCount = await platformPrisma.geofence.count({ where: { locationId } });
    if (existingCount >= 20) {
      throw ApiError.badRequest('Maximum 20 geofences per location');
    }

    // If setting as default, unset current default
    if (data.isDefault === true) {
      await platformPrisma.geofence.updateMany({
        where: { locationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // First geofence for location is always default
    const isDefault = existingCount === 0 ? true : (data.isDefault ?? false);

    try {
      return await platformPrisma.geofence.create({
        data: {
          locationId,
          companyId,
          name: data.name,
          lat: data.lat,
          lng: data.lng,
          radius: data.radius ?? 100,
          address: data.address ?? null,
          isDefault,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('A geofence with this name already exists for this location');
      }
      throw err;
    }
  }

  // ── Update geofence ─────────────────────────────────────────────────
  async updateGeofence(
    companyId: string,
    id: string,
    data: Partial<{
      name: string | undefined;
      lat: number | undefined;
      lng: number | undefined;
      radius: number | undefined;
      address: string | undefined;
      isDefault: boolean | undefined;
    }>,
  ) {
    const existing = await platformPrisma.geofence.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Geofence not found');
    }

    // If setting as default, unset current default for the same location
    if (data.isDefault === true) {
      await platformPrisma.geofence.updateMany({
        where: { locationId: existing.locationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Strip undefined values for exactOptionalPropertyTypes compatibility
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );

    try {
      return await platformPrisma.geofence.update({
        where: { id },
        data: updateData,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('A geofence with this name already exists for this location');
      }
      throw err;
    }
  }

  // ── Delete geofence ─────────────────────────────────────────────────
  async deleteGeofence(companyId: string, id: string) {
    const existing = await platformPrisma.geofence.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Geofence not found');
    }

    // Prevent deletion if active employees are assigned
    const assignedCount = await platformPrisma.employee.count({
      where: { geofenceId: id, status: { not: 'EXITED' } },
    });
    if (assignedCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete: ${assignedCount} active employee(s) are assigned to this geofence`,
      );
    }

    // If deleting the default, promote another geofence
    if (existing.isDefault) {
      const next = await platformPrisma.geofence.findFirst({
        where: { locationId: existing.locationId, isActive: true, id: { not: id } },
      });
      if (next) {
        await platformPrisma.geofence.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    await platformPrisma.geofence.delete({ where: { id } });
    return { message: 'Geofence deleted' };
  }

  // ── Set default geofence ────────────────────────────────────────────
  async setDefault(companyId: string, id: string) {
    const existing = await platformPrisma.geofence.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Geofence not found');
    }

    // Unset current default for the location
    await platformPrisma.geofence.updateMany({
      where: { locationId: existing.locationId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this one as default
    return platformPrisma.geofence.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  // ── Dropdown list (active only, minimal fields) ─────────────────────
  async listForDropdown(companyId: string, locationId: string) {
    return platformPrisma.geofence.findMany({
      where: { locationId, companyId, isActive: true },
      select: { id: true, name: true, radius: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }
}

export const geofenceService = new GeofenceService();
