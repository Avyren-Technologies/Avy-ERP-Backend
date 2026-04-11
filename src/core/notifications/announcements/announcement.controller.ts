import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { announcementService } from './announcement.service';

const sendAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().min(1, 'Body is required').max(5000),
  imageUrl: z.string().url().optional(),
  channels: z
    .array(z.enum(['IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP']))
    .min(1, 'At least one channel is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  recipientFilter: z.discriminatedUnion('type', [
    z.object({ type: z.literal('COMPANY_WIDE') }),
    z.object({ type: z.literal('DEPARTMENT'), departmentId: z.string().min(1) }),
    z.object({ type: z.literal('DESIGNATION'), designationId: z.string().min(1) }),
    z.object({
      type: z.literal('EMPLOYEES'),
      employeeIds: z.array(z.string().min(1)).min(1),
    }),
  ]),
});

class AnnouncementController {
  send = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user?.id || !user.companyId) {
      throw ApiError.unauthorized('Authentication required');
    }

    const parsed = sendAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.errors.map((e) => e.message).join(', '),
      );
    }

    const result = await announcementService.send({
      companyId: user.companyId,
      ...parsed.data,
      sentBy: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
    });

    res.json(createSuccessResponse(result, 'Announcement sent'));
  });
}

export const announcementController = new AnnouncementController();
