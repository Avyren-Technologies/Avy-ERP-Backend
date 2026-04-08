import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { createSuccessResponse } from '../../shared/utils';
import { uploadService } from '../../shared/services/upload.service';
import { requestUploadSchema, requestUploadPlatformSchema, downloadUrlSchema } from './upload.validators';

class UploadController {
  requestUpload = asyncHandler(async (req: Request, res: Response) => {
    const parsed = requestUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw ApiError.unauthorized('Company context required');
    }

    const result = await uploadService.requestUpload({
      ...parsed.data,
      companyId,
    });

    res.json(createSuccessResponse(result, 'Upload URL generated'));
  });

  requestUploadPlatform = asyncHandler(async (req: Request, res: Response) => {
    const parsed = requestUploadPlatformSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await uploadService.requestUpload(parsed.data);
    res.json(createSuccessResponse(result, 'Upload URL generated'));
  });

  getDownloadUrl = asyncHandler(async (req: Request, res: Response) => {
    const parsed = downloadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      throw ApiError.unauthorized('Company context required');
    }

    const result = await uploadService.getDownloadUrl(parsed.data.key, companyId);
    res.json(createSuccessResponse(result, 'Download URL generated'));
  });

  getDownloadUrlPlatform = asyncHandler(async (req: Request, res: Response) => {
    const parsed = downloadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await uploadService.getDownloadUrlAdmin(parsed.data.key);
    res.json(createSuccessResponse(result, 'Download URL generated'));
  });
}

export const uploadController = new UploadController();
