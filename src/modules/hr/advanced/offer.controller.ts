import { Request, Response } from 'express';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { offerService } from './offer.service';
import { createOfferSchema, updateOfferSchema, updateOfferStatusSchema } from './offer.validators';

class OfferController {
  listOffers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.candidateId) opts.candidateId = req.query.candidateId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await offerService.listOffers(companyId, opts);
    res.json(createPaginatedResponse(result.offers, result.page, result.limit, result.total, 'Offers retrieved'));
  });

  getOffer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const offer = await offerService.getOffer(companyId, req.params.id!);
    res.json(createSuccessResponse(offer, 'Offer retrieved'));
  });

  createOffer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const offer = await offerService.createOffer(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(offer, 'Offer created'));
  });

  updateOffer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const offer = await offerService.updateOffer(companyId, req.params.id!, parsed.data, req.user!.id);
    res.json(createSuccessResponse(offer, 'Offer updated'));
  });

  updateOfferStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateOfferStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const userId = req.user?.id;
    const offer = await offerService.updateOfferStatus(companyId, req.params.id!, parsed.data, userId);
    res.json(createSuccessResponse(offer, 'Offer status updated'));
  });

  deleteOffer = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await offerService.deleteOffer(companyId, req.params.id!, req.user!.id);
    res.json(createSuccessResponse(result, 'Offer deleted'));
  });
}

export const offerController = new OfferController();
