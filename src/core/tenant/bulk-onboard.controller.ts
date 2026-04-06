import { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { createSuccessResponse } from '../../shared/utils';
import { bulkOnboardService } from './bulk-onboard.service';
import { bulkOnboardImportBodySchema } from './bulk-onboard.validators';
import type { OnboardTenantPayload } from './tenant.types';

// Multer config: memory storage, 10MB limit, xlsx only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are accepted'));
    }
  },
});

export const bulkOnboardUploadMiddleware = upload.single('file');

class BulkOnboardController {
  // GET /platform/tenants/bulk/template
  downloadTemplate = asyncHandler(async (_req: Request, res: Response) => {
    const workbook = await bulkOnboardService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Company_Onboarding_Template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });

  // POST /platform/tenants/bulk/validate
  validateUpload = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    const result = await bulkOnboardService.validateUpload(req.file.buffer);
    res.json(createSuccessResponse(result, 'Validation complete'));
  });

  // POST /platform/tenants/bulk/import
  confirmImport = asyncHandler(async (req: Request, res: Response) => {
    const parsed = bulkOnboardImportBodySchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const companies = parsed.data.companies as { name: string; payload: OnboardTenantPayload }[];
    const result = await bulkOnboardService.importCompanies(companies);
    res.json(createSuccessResponse(result, `Import complete: ${result.successCount} created, ${result.failureCount} failed`));
  });
}

export const bulkOnboardController = new BulkOnboardController();
