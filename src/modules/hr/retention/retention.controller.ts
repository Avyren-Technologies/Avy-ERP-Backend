import { Request, Response } from 'express';
import { retentionService } from './retention.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  upsertPolicySchema,
  createDataAccessRequestSchema,
  processDataAccessRequestSchema,
  recordConsentSchema,
} from './retention.validators';

export class RetentionController {
  // ── Retention Policies ──────────────────────────────────────────────────

  listPolicies = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const policies = await retentionService.listPolicies(companyId);
    res.json(createSuccessResponse(policies, 'Retention policies retrieved'));
  });

  upsertPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = upsertPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const policy = await retentionService.upsertPolicy(companyId, parsed.data as any);
    res.status(201).json(createSuccessResponse(policy, 'Retention policy saved'));
  });

  deletePolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await retentionService.deletePolicy(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Retention policy deleted'));
  });

  // ── Data Access Requests ────────────────────────────────────────────────

  listDataAccessRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;

    const result = await retentionService.listDataAccessRequests(companyId, opts);
    res.json(createPaginatedResponse(result.requests, result.page, result.limit, result.total, 'Data access requests retrieved'));
  });

  createDataAccessRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDataAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    // employeeId comes from the request body or the authenticated user's employee record
    const employeeId = req.body.employeeId;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const request = await retentionService.createDataAccessRequest(companyId, employeeId, parsed.data as any);
    res.status(201).json(createSuccessResponse(request, 'Data access request created'));
  });

  processDataAccessRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = processDataAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await retentionService.processDataAccessRequest(
      companyId,
      req.params.id!,
      parsed.data as any,
      req.user!.id,
    );
    res.json(createSuccessResponse(result, 'Data access request processed'));
  });

  // ── Data Export ─────────────────────────────────────────────────────────

  exportEmployeeData = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const data = await retentionService.exportEmployeeData(companyId, req.params.employeeId!);
    res.json(createSuccessResponse(data, 'Employee data exported'));
  });

  // ── Anonymisation ───────────────────────────────────────────────────────

  anonymiseEmployee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await retentionService.anonymiseEmployee(companyId, req.params.employeeId!);
    res.json(createSuccessResponse(result, 'Employee data anonymised'));
  });

  // ── Consent Management ──────────────────────────────────────────────────

  listConsents = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const consents = await retentionService.listConsents(companyId, req.params.employeeId!);
    res.json(createSuccessResponse(consents, 'Consent records retrieved'));
  });

  recordConsent = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = recordConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const parsedData = parsed.data as any;
    const consent = await retentionService.recordConsent(companyId, parsedData.employeeId, {
      consentType: parsedData.consentType,
      granted: parsedData.granted,
      ipAddress: parsedData.ipAddress,
    });
    res.status(201).json(createSuccessResponse(consent, 'Consent recorded'));
  });

  // ── Retention Check ─────────────────────────────────────────────────────

  checkRetentionDue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const results = await retentionService.checkRetentionDue(companyId);
    res.json(createSuccessResponse(results, 'Retention check completed'));
  });
}

export const retentionController = new RetentionController();
