import { Prisma, TrainingAttendanceStatus } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Calculate hours between two ISO date strings, rounded to 1 decimal. */
function calculateHours(checkIn: string, checkOut: string): number {
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
}

export class TrainingAttendanceService {
  // ════════════════════════════════════════════════════════════════
  // List attendees for a session
  // ════════════════════════════════════════════════════════════════

  async listAttendees(companyId: string, sessionId: string) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    const attendees = await platformPrisma.trainingAttendance.findMany({
      where: { sessionId, companyId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        nomination: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return attendees;
  }

  // ════════════════════════════════════════════════════════════════
  // Register attendees (bulk create)
  // ════════════════════════════════════════════════════════════════

  async registerAttendees(
    companyId: string,
    sessionId: string,
    data: {
      employeeIds: string[];
      nominationIds?: Record<string, string> | undefined;
    },
  ) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    // Find existing registrations to skip duplicates
    const existing = await platformPrisma.trainingAttendance.findMany({
      where: { sessionId, employeeId: { in: data.employeeIds }, companyId },
      select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((e) => e.employeeId));

    const newEmployeeIds = data.employeeIds.filter((id) => !existingIds.has(id));

    if (newEmployeeIds.length === 0) {
      return { created: 0, skipped: data.employeeIds.length };
    }

    const records = newEmployeeIds.map((employeeId) => ({
      sessionId,
      employeeId,
      nominationId: data.nominationIds?.[employeeId] ?? null,
      status: 'REGISTERED' as TrainingAttendanceStatus,
      companyId,
    }));

    await platformPrisma.trainingAttendance.createMany({ data: records });

    return {
      created: newEmployeeIds.length,
      skipped: data.employeeIds.length - newEmployeeIds.length,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Mark individual attendance
  // ════════════════════════════════════════════════════════════════

  async markAttendance(
    companyId: string,
    id: string,
    data: {
      status: TrainingAttendanceStatus;
      checkInTime?: string | undefined;
      checkOutTime?: string | undefined;
      remarks?: string | undefined;
    },
  ) {
    const attendance = await platformPrisma.trainingAttendance.findUnique({
      where: { id },
    });

    if (!attendance || attendance.companyId !== companyId) {
      throw ApiError.notFound('Training attendance record not found');
    }

    const checkIn = data.checkInTime ?? (attendance.checkInTime?.toISOString());
    const checkOut = data.checkOutTime ?? (attendance.checkOutTime?.toISOString());

    let hoursAttended: Prisma.Decimal | null = attendance.hoursAttended;
    if (checkIn && checkOut) {
      hoursAttended = new Prisma.Decimal(calculateHours(checkIn, checkOut));
    }

    const updateData: Record<string, any> = {
      status: data.status,
      hoursAttended,
    };
    if (data.checkInTime !== undefined) updateData.checkInTime = new Date(data.checkInTime);
    if (data.checkOutTime !== undefined) updateData.checkOutTime = new Date(data.checkOutTime);
    if (data.remarks !== undefined) updateData.remarks = data.remarks;

    const updated = await platformPrisma.trainingAttendance.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
    });

    return updated;
  }

  // ════════════════════════════════════════════════════════════════
  // Bulk mark attendance
  // ════════════════════════════════════════════════════════════════

  async bulkMarkAttendance(
    companyId: string,
    sessionId: string,
    data: {
      attendances: Array<{
        id: string;
        status: TrainingAttendanceStatus;
        checkInTime?: string | undefined;
        checkOutTime?: string | undefined;
        remarks?: string | undefined;
      }>;
    },
  ) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    // Verify all attendance records belong to this session + company
    const attendanceIds = data.attendances.map((a) => a.id);
    const existingRecords = await platformPrisma.trainingAttendance.findMany({
      where: { id: { in: attendanceIds }, sessionId, companyId },
      select: { id: true, checkInTime: true, checkOutTime: true, hoursAttended: true },
    });

    const existingMap = new Map(existingRecords.map((r) => [r.id, r]));

    const missingIds = attendanceIds.filter((id) => !existingMap.has(id));
    if (missingIds.length > 0) {
      throw ApiError.badRequest(`Attendance records not found: ${missingIds.join(', ')}`);
    }

    const updates = data.attendances.map((att) => {
      const existing = existingMap.get(att.id)!;
      const checkIn = att.checkInTime ?? existing.checkInTime?.toISOString();
      const checkOut = att.checkOutTime ?? existing.checkOutTime?.toISOString();

      let hoursAttended: Prisma.Decimal | null = existing.hoursAttended;
      if (checkIn && checkOut) {
        hoursAttended = new Prisma.Decimal(calculateHours(checkIn, checkOut));
      }

      const updateData: Record<string, any> = {
        status: att.status,
        hoursAttended,
      };
      if (att.checkInTime !== undefined) updateData.checkInTime = new Date(att.checkInTime);
      if (att.checkOutTime !== undefined) updateData.checkOutTime = new Date(att.checkOutTime);
      if (att.remarks !== undefined) updateData.remarks = att.remarks;

      return platformPrisma.trainingAttendance.update({
        where: { id: att.id },
        data: updateData,
      });
    });

    const results = await platformPrisma.$transaction(updates);

    return { updated: results.length };
  }
}

export const trainingAttendanceService = new TrainingAttendanceService();
