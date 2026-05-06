import { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { leaveBalanceBulkImportService } from './bulk-import.service';
import { bulkBalanceImportBodySchema } from './bulk-import.validators';

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

export const bulkBalanceUploadMiddleware = upload.single('file');

class LeaveBalanceBulkImportController {
  // GET /hr/leave/leave-balances/bulk/template
  downloadTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const workbook = await leaveBalanceBulkImportService.generateTemplate(companyId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Leave_Balance_Import_Template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });

  // POST /hr/leave/leave-balances/bulk/validate
  validateUpload = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    const result = await leaveBalanceBulkImportService.validateUpload(companyId, req.file.buffer);
    res.json(createSuccessResponse(result, 'Validation complete'));
  });

  // POST /hr/leave/leave-balances/bulk/import
  confirmImport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = bulkBalanceImportBodySchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');
    const result = await leaveBalanceBulkImportService.confirmImport(companyId, parsed.data.rows, userId);
    res.json(createSuccessResponse(result, `Import complete: ${result.successCount} succeeded, ${result.failureCount} failed`));
  });
}

export const leaveBalanceBulkImportController = new LeaveBalanceBulkImportController();
