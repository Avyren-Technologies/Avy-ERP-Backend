import { Request, Response } from 'express';
import { transferPromotionService } from './transfer.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createTransferSchema, createPromotionSchema, approveSchema } from './transfer.validators';

export class TransferPromotionController {
  // ════════════════════════════════════════════════════════════════════════
  //  TRANSFERS
  // ════════════════════════════════════════════════════════════════════════

  listTransfers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await transferPromotionService.listTransfers(companyId, opts);
    res.json(createPaginatedResponse(result.transfers, result.page, result.limit, result.total, 'Transfers retrieved'));
  });

  createTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const transfer = await transferPromotionService.createTransfer(companyId, req.user!.id, parsed.data);
    res.status(201).json(createSuccessResponse(transfer, 'Transfer created'));
  });

  getTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const transfer = await transferPromotionService.getTransfer(companyId, req.params.id!);
    res.json(createSuccessResponse(transfer, 'Transfer retrieved'));
  });

  approveTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const transfer = await transferPromotionService.approveTransfer(companyId, req.params.id!, req.user!.id, parsed.data.note);
    res.json(createSuccessResponse(transfer, 'Transfer approved'));
  });

  applyTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const transfer = await transferPromotionService.applyTransfer(companyId, req.params.id!);
    res.json(createSuccessResponse(transfer, 'Transfer applied'));
  });

  rejectTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const transfer = await transferPromotionService.rejectTransfer(companyId, req.params.id!, req.user!.id, parsed.data.note ?? '');
    res.json(createSuccessResponse(transfer, 'Transfer rejected'));
  });

  cancelTransfer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const transfer = await transferPromotionService.cancelTransfer(companyId, req.params.id!);
    res.json(createSuccessResponse(transfer, 'Transfer cancelled'));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  PROMOTIONS
  // ════════════════════════════════════════════════════════════════════════

  listPromotions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await transferPromotionService.listPromotions(companyId, opts);
    res.json(createPaginatedResponse(result.promotions, result.page, result.limit, result.total, 'Promotions retrieved'));
  });

  createPromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createPromotionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const promotion = await transferPromotionService.createPromotion(companyId, req.user!.id, parsed.data);
    res.status(201).json(createSuccessResponse(promotion, 'Promotion created'));
  });

  getPromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const promotion = await transferPromotionService.getPromotion(companyId, req.params.id!);
    res.json(createSuccessResponse(promotion, 'Promotion retrieved'));
  });

  approvePromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const promotion = await transferPromotionService.approvePromotion(companyId, req.params.id!, req.user!.id, parsed.data.note);
    res.json(createSuccessResponse(promotion, 'Promotion approved'));
  });

  applyPromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const promotion = await transferPromotionService.applyPromotion(companyId, req.params.id!);
    res.json(createSuccessResponse(promotion, 'Promotion applied'));
  });

  rejectPromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const promotion = await transferPromotionService.rejectPromotion(companyId, req.params.id!, req.user!.id, parsed.data.note ?? '');
    res.json(createSuccessResponse(promotion, 'Promotion rejected'));
  });

  cancelPromotion = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const promotion = await transferPromotionService.cancelPromotion(companyId, req.params.id!);
    res.json(createSuccessResponse(promotion, 'Promotion cancelled'));
  });
}

export const transferPromotionController = new TransferPromotionController();
