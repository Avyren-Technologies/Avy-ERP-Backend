import { Request, Response } from 'express';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { trainingSessionService } from './training-session.service';
import { createSessionSchema, updateSessionSchema, updateSessionStatusSchema } from './training-session.validators';

class TrainingSessionController {
  listSessions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.trainingId) opts.trainingId = req.query.trainingId as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.trainerId) opts.trainerId = req.query.trainerId as string;

    const result = await trainingSessionService.listSessions(companyId, opts);
    res.json(createPaginatedResponse(result.sessions, result.page, result.limit, result.total, 'Training sessions retrieved'));
  });

  getSession = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const session = await trainingSessionService.getSession(companyId, req.params.id!);
    res.json(createSuccessResponse(session, 'Training session retrieved'));
  });

  createSession = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const session = await trainingSessionService.createSession(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(session, 'Training session created'));
  });

  updateSession = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const session = await trainingSessionService.updateSession(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(session, 'Training session updated'));
  });

  updateSessionStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSessionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const session = await trainingSessionService.updateSessionStatus(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(session, 'Training session status updated'));
  });

  deleteSession = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await trainingSessionService.deleteSession(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Training session deleted'));
  });
}

export const trainingSessionController = new TrainingSessionController();
