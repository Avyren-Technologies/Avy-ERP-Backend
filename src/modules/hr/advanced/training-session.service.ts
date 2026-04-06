import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { validateTransition, SESSION_TRANSITIONS } from '../../../shared/utils/state-machine';
import { n } from '../../../shared/utils/prisma-helpers';

interface ListOptions {
  page?: number;
  limit?: number;
}

interface SessionListOptions extends ListOptions {
  trainingId?: string;
  status?: string;
  trainerId?: string;
}

class TrainingSessionService {
  // ════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════

  async listSessions(companyId: string, options: SessionListOptions = {}) {
    const { page = 1, limit = 25, trainingId, status, trainerId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (trainingId) where.trainingId = trainingId;
    if (status) where.status = status.toUpperCase();
    if (trainerId) where.trainerId = trainerId;

    const [sessions, total] = await Promise.all([
      platformPrisma.trainingSession.findMany({
        where,
        include: {
          training: { select: { id: true, name: true, type: true, mode: true } },
          trainer: {
            select: {
              id: true,
              externalName: true,
              isInternal: true,
              employee: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          _count: { select: { attendees: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { startDateTime: 'desc' },
      }),
      platformPrisma.trainingSession.count({ where }),
    ]);

    return { sessions, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════════════════════

  async getSession(companyId: string, id: string) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id },
      include: {
        training: { select: { id: true, name: true, type: true, mode: true, certificationName: true, certificationValidity: true } },
        trainer: {
          select: {
            id: true,
            externalName: true,
            isInternal: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { attendees: true } },
      },
    });

    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    return session;
  }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createSession(companyId: string, data: any) {
    // Validate training exists and belongs to company
    const training = await platformPrisma.trainingCatalogue.findUnique({
      where: { id: data.trainingId },
    });
    if (!training || training.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }

    const sessionNumber = await generateNextNumber(
      platformPrisma, companyId, ['Training Session'], 'Training Session',
    );

    const session = await platformPrisma.trainingSession.create({
      data: {
        companyId,
        sessionNumber,
        trainingId: data.trainingId,
        batchName: n(data.batchName),
        startDateTime: new Date(data.startDateTime),
        endDateTime: new Date(data.endDateTime),
        venue: n(data.venue),
        meetingLink: n(data.meetingLink),
        maxParticipants: n(data.maxParticipants),
        trainerId: n(data.trainerId),
        notes: n(data.notes),
        status: 'SCHEDULED',
      },
      include: {
        training: { select: { id: true, name: true, type: true, mode: true } },
        trainer: {
          select: {
            id: true,
            externalName: true,
            isInternal: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { attendees: true } },
      },
    });

    return session;
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════

  async updateSession(companyId: string, id: string, data: any) {
    const session = await platformPrisma.trainingSession.findUnique({ where: { id } });
    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    if (session.status !== 'SCHEDULED') {
      throw ApiError.badRequest('Only SCHEDULED sessions can be updated');
    }

    return platformPrisma.trainingSession.update({
      where: { id },
      data: {
        ...(data.batchName !== undefined && { batchName: n(data.batchName) }),
        ...(data.startDateTime !== undefined && { startDateTime: new Date(data.startDateTime) }),
        ...(data.endDateTime !== undefined && { endDateTime: new Date(data.endDateTime) }),
        ...(data.venue !== undefined && { venue: n(data.venue) }),
        ...(data.meetingLink !== undefined && { meetingLink: n(data.meetingLink) }),
        ...(data.maxParticipants !== undefined && { maxParticipants: n(data.maxParticipants) }),
        ...(data.trainerId !== undefined && { trainerId: n(data.trainerId) }),
        ...(data.notes !== undefined && { notes: n(data.notes) }),
      },
      include: {
        training: { select: { id: true, name: true, type: true, mode: true } },
        trainer: {
          select: {
            id: true,
            externalName: true,
            isInternal: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { attendees: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE STATUS
  // ════════════════════════════════════════════════════════════════

  async updateSessionStatus(
    companyId: string,
    id: string,
    statusData: { status: string; cancelledReason?: string | undefined },
  ) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id },
      include: {
        training: {
          select: { id: true, certificationName: true, certificationValidity: true, duration: true },
        },
      },
    });
    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    validateTransition(session.status, statusData.status, SESSION_TRANSITIONS, 'session status');

    const updateData: any = { status: statusData.status };

    if (statusData.status === 'CANCELLED') {
      updateData.cancelledReason = statusData.cancelledReason;
    }

    const updated = await platformPrisma.trainingSession.update({
      where: { id },
      data: updateData,
      include: {
        training: { select: { id: true, name: true, type: true, mode: true } },
        trainer: {
          select: {
            id: true,
            externalName: true,
            isInternal: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { attendees: true } },
      },
    });

    // On COMPLETED: auto-calculate hours for attendees, advance nominations, increment trainer sessions
    if (statusData.status === 'COMPLETED') {
      await this.onSessionCompleted(session);
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════════
  // DELETE
  // ════════════════════════════════════════════════════════════════

  async deleteSession(companyId: string, id: string) {
    const session = await platformPrisma.trainingSession.findUnique({
      where: { id },
      include: { _count: { select: { attendees: true } } },
    });
    if (!session || session.companyId !== companyId) {
      throw ApiError.notFound('Training session not found');
    }

    if (session.status !== 'SCHEDULED') {
      throw ApiError.badRequest('Only SCHEDULED sessions can be deleted');
    }

    if (session._count.attendees > 0) {
      throw ApiError.badRequest('Cannot delete session with attendees. Remove attendees first.');
    }

    await platformPrisma.trainingSession.delete({ where: { id } });
    return { message: 'Training session deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE — Session completion side-effects
  // ════════════════════════════════════════════════════════════════

  private async onSessionCompleted(session: any) {
    // 1. Calculate session duration in hours
    const startMs = new Date(session.startDateTime).getTime();
    const endMs = new Date(session.endDateTime).getTime();
    const sessionHours = Math.round(((endMs - startMs) / (1000 * 60 * 60)) * 10) / 10; // 1 decimal

    await platformPrisma.$transaction(async (tx) => {
      // 2. Auto-calculate hoursAttended for attendees with PRESENT or LATE status
      const attendees = await tx.trainingAttendance.findMany({
        where: { sessionId: session.id, status: { in: ['PRESENT', 'LATE'] } },
      });

      for (const attendee of attendees) {
        let hours = sessionHours;

        // If check-in and check-out times are recorded, use those instead
        if (attendee.checkInTime && attendee.checkOutTime) {
          const inMs = new Date(attendee.checkInTime).getTime();
          const outMs = new Date(attendee.checkOutTime).getTime();
          hours = Math.round(((outMs - inMs) / (1000 * 60 * 60)) * 10) / 10;
        }

        await tx.trainingAttendance.update({
          where: { id: attendee.id },
          data: { hoursAttended: hours },
        });
      }

      // 3. Advance linked nominations to COMPLETED for attendees with sufficient hours
      // Consider >= 50% of session hours as "sufficient"
      const minimumHours = sessionHours * 0.5;
      const eligibleEmployeeIds = attendees.map((a: any) => a.employeeId);

      if (eligibleEmployeeIds.length > 0) {
        // Find nominations linked to this session that are IN_PROGRESS
        const nominations = await tx.trainingNomination.findMany({
          where: {
            sessionId: session.id,
            status: 'IN_PROGRESS',
            employeeId: { in: eligibleEmployeeIds },
          },
        });

        for (const nomination of nominations) {
          // Check this employee's actual hours
          const att = attendees.find((a: any) => a.employeeId === nomination.employeeId);
          let empHours = sessionHours;
          if (att?.checkInTime && att?.checkOutTime) {
            const inMs = new Date(att.checkInTime).getTime();
            const outMs = new Date(att.checkOutTime).getTime();
            empHours = Math.round(((outMs - inMs) / (1000 * 60 * 60)) * 10) / 10;
          }

          if (empHours >= minimumHours) {
            const updateData: any = {
              status: 'COMPLETED',
              completionDate: new Date(),
            };

            // Auto-set certificate fields if training has certification
            if (session.training?.certificationName) {
              updateData.certificateIssuedAt = new Date();
              updateData.certificateStatus = 'EARNED';

              if (session.training.certificationValidity) {
                const expiryDate = new Date();
                expiryDate.setFullYear(expiryDate.getFullYear() + session.training.certificationValidity);
                updateData.certificateExpiryDate = expiryDate;
              }
            }

            await tx.trainingNomination.update({
              where: { id: nomination.id },
              data: updateData,
            });
          }
        }
      }

      // 4. Increment trainer's totalSessions
      if (session.trainerId) {
        await tx.trainer.update({
          where: { id: session.trainerId },
          data: { totalSessions: { increment: 1 } },
        });
      }
    });
  }
}

export const trainingSessionService = new TrainingSessionService();
