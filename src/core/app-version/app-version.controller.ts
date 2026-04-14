import { Request, Response } from 'express';
import { appVersionService } from './app-version.service';
import {
  checkVersionQuerySchema,
  createAppVersionConfigSchema,
  updateAppVersionConfigSchema,
} from './app-version.validators';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';

class AppVersionController {
  /**
   * Public — no auth required.
   * GET /app-version/check?platform=ANDROID&version=1.0.5
   */
  checkVersion = asyncHandler(async (req: Request, res: Response) => {
    const parsed = checkVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const result = await appVersionService.checkVersion(parsed.data.platform, parsed.data.version);
    res.json(createSuccessResponse(result, 'Version check completed'));
  });

  // ── Admin CRUD (super admin only) ──────────────────────────

  list = asyncHandler(async (_req: Request, res: Response) => {
    const configs = await appVersionService.list();
    res.json(createSuccessResponse(configs, 'App version configs retrieved'));
  });

  getByPlatform = asyncHandler(async (req: Request, res: Response) => {
    const platform = req.params.platform?.toUpperCase();
    if (!platform) throw ApiError.badRequest('Platform is required');
    const config = await appVersionService.getByPlatform(platform);
    if (!config) throw ApiError.notFound(`No config found for platform: ${platform}`);
    res.json(createSuccessResponse(config));
  });

  upsert = asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAppVersionConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const config = await appVersionService.upsert(parsed.data.platform, parsed.data);
    res.status(201).json(createSuccessResponse(config, 'App version config saved'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Config ID is required');
    const parsed = updateAppVersionConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const config = await appVersionService.update(id, parsed.data);
    res.json(createSuccessResponse(config, 'App version config updated'));
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Config ID is required');
    await appVersionService.delete(id);
    res.json(createSuccessResponse(null, 'App version config deleted'));
  });
}

export const appVersionController = new AppVersionController();
