import type { NotificationChannel, NotificationPriority } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { notificationService } from '../notification.service';

export interface AnnouncementInput {
  companyId: string;
  title: string;
  body: string;
  imageUrl?: string | undefined;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  recipientFilter:
    | { type: 'COMPANY_WIDE' }
    | { type: 'DEPARTMENT'; departmentId: string }
    | { type: 'DESIGNATION'; designationId: string }
    | { type: 'EMPLOYEES'; employeeIds: string[] };
  sentBy: string;
}

export const announcementService = {
  async send(input: AnnouncementInput) {
    const { companyId, recipientFilter } = input;

    // Resolve recipients based on filter
    const where: Record<string, unknown> = {
      companyId,
      status: { notIn: ['EXITED'] },
    };
    if (recipientFilter.type === 'DEPARTMENT') {
      where.departmentId = recipientFilter.departmentId;
    } else if (recipientFilter.type === 'DESIGNATION') {
      where.designationId = recipientFilter.designationId;
    } else if (recipientFilter.type === 'EMPLOYEES') {
      where.id = { in: recipientFilter.employeeIds };
    }

    const employees = await platformPrisma.employee.findMany({
      where: where as any,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        user: { select: { id: true } },
      },
    });

    const recipients = employees
      .filter((e) => e.user?.id)
      .map((e) => ({
        userId: e.user!.id,
        tokens: {
          employee_name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
        },
      }));

    if (recipients.length === 0) {
      return { sent: 0, message: 'No eligible recipients found' };
    }

    const result = await notificationService.dispatchBulk({
      companyId,
      triggerEvent: 'ANNOUNCEMENT',
      entityType: 'Announcement',
      recipients,
      sharedTokens: {
        title: input.title,
        body: input.body,
        ...(input.imageUrl && { image_url: input.imageUrl }),
        sent_by: input.sentBy,
      },
      priority: input.priority,
      type: 'ANNOUNCEMENTS',
    });

    logger.info('Announcement sent', {
      companyId,
      recipientFilter: recipientFilter.type,
      recipientCount: recipients.length,
      enqueued: result.enqueued,
      traceId: result.traceId,
    });

    return {
      sent: result.enqueued,
      skipped: result.skipped,
      traceId: result.traceId,
      recipientCount: recipients.length,
    };
  },
};
