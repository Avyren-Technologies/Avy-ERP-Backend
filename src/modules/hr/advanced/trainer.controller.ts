import { Request, Response } from 'express';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { trainerService } from './trainer.service';
import { createTrainerSchema, updateTrainerSchema } from './trainer.validators';

class TrainerController {
  listTrainers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.isInternal !== undefined) opts.isInternal = req.query.isInternal === 'true';
    if (req.query.isActive !== undefined) opts.isActive = req.query.isActive === 'true';

    const result = await trainerService.listTrainers(companyId, opts);
    res.json(createPaginatedResponse(result.trainers, result.page, result.limit, result.total, 'Trainers retrieved'));
  });

  getTrainer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const trainer = await trainerService.getTrainer(companyId, req.params.id!);
    res.json(createSuccessResponse(trainer, 'Trainer retrieved'));
  });

  createTrainer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTrainerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const trainer = await trainerService.createTrainer(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(trainer, 'Trainer created'));
  });

  updateTrainer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateTrainerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const trainer = await trainerService.updateTrainer(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(trainer, 'Trainer updated'));
  });

  deleteTrainer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await trainerService.deleteTrainer(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Trainer deactivated'));
  });
}

export const trainerController = new TrainerController();
