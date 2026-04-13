import { Request, Response } from 'express';
import { watchlistService } from './watchlist.service';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  watchlistListQuerySchema,
  watchlistCheckSchema,
} from './watchlist.validators';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

export class WatchlistController {
  // ────────────────────────────────────────────────────────────────────
  // List entries (filter by type, isActive)
  // ────────────────────────────────────────────────────────────────────

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = watchlistListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { type, isActive, search, page: pg, limit: lmt } = parsed.data;
    const result = await watchlistService.list(companyId, {
      ...(type !== undefined ? { type } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search !== undefined ? { search } : {}),
      page: pg,
      limit: lmt,
    });
    res.json(
      createPaginatedResponse(result.data, result.page, result.limit, result.total, 'Watchlist entries retrieved'),
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // Get single entry
  // ────────────────────────────────────────────────────────────────────

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const entry = await watchlistService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(entry, 'Watchlist entry retrieved'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Create entry
  // ────────────────────────────────────────────────────────────────────

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createWatchlistSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await watchlistService.create(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(entry, 'Watchlist entry created'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Update entry
  // ────────────────────────────────────────────────────────────────────

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateWatchlistSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await watchlistService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(entry, 'Watchlist entry updated'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Soft delete (set isActive=false)
  // ────────────────────────────────────────────────────────────────────

  remove = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await watchlistService.remove(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Watchlist entry deactivated'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Check visitor against watchlist/blocklist
  // ────────────────────────────────────────────────────────────────────

  check = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = watchlistCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { name, mobile, idNumber } = parsed.data;
    const result = await watchlistService.check(companyId, {
      ...(name !== undefined ? { name } : {}),
      ...(mobile !== undefined ? { mobile } : {}),
      ...(idNumber !== undefined ? { idNumber } : {}),
    });
    res.json(createSuccessResponse(result, 'Watchlist check completed'));
  });
}

export const watchlistController = new WatchlistController();
