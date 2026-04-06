import { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { bulkImportService } from './bulk-import.service';
import { bulkValidateBodySchema, bulkImportBodySchema } from './bulk-import.validators';

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

export const bulkUploadMiddleware = upload.single('file');

class BulkImportController {
  // GET /hr/employees/bulk/template
  downloadTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const workbook = await bulkImportService.generateTemplate(companyId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });

  // POST /hr/employees/bulk/validate
  validateUpload = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    const parsed = bulkValidateBodySchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await bulkImportService.validateUpload(companyId, req.file.buffer, parsed.data.defaultPassword);
    res.json(createSuccessResponse(result, 'Validation complete'));
  });

  // POST /hr/employees/bulk/import
  confirmImport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = bulkImportBodySchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const performedBy = req.user?.id;
    const result = await bulkImportService.importRows(companyId, parsed.data.rows, parsed.data.defaultPassword, performedBy);
    res.json(createSuccessResponse(result, `Import complete: ${result.successCount} created, ${result.failureCount} failed`));
  });
}

export const bulkImportController = new BulkImportController();
