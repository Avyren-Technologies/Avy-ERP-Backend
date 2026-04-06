import { Request, Response } from 'express';
import { candidateProfileService } from './candidate-profile.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createEducationSchema,
  updateEducationSchema,
  createExperienceSchema,
  updateExperienceSchema,
  createDocumentSchema,
} from './candidate-profile.validators';

export class CandidateProfileController {
  // ════════════════════════════════════════════════════════════════
  // EDUCATION
  // ════════════════════════════════════════════════════════════════

  listEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const records = await candidateProfileService.listEducation(companyId, req.params.candidateId!);
    res.json(createSuccessResponse(records, 'Education records retrieved'));
  });

  createEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createEducationSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await candidateProfileService.createEducation(companyId, req.params.candidateId!, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Education record created'));
  });

  updateEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateEducationSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await candidateProfileService.updateEducation(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(record, 'Education record updated'));
  });

  deleteEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await candidateProfileService.deleteEducation(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Education record deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // EXPERIENCE
  // ════════════════════════════════════════════════════════════════

  listExperience = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const records = await candidateProfileService.listExperience(companyId, req.params.candidateId!);
    res.json(createSuccessResponse(records, 'Experience records retrieved'));
  });

  createExperience = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createExperienceSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await candidateProfileService.createExperience(companyId, req.params.candidateId!, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Experience record created'));
  });

  updateExperience = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateExperienceSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await candidateProfileService.updateExperience(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(record, 'Experience record updated'));
  });

  deleteExperience = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await candidateProfileService.deleteExperience(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Experience record deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ════════════════════════════════════════════════════════════════

  listDocuments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const records = await candidateProfileService.listDocuments(companyId, req.params.candidateId!);
    res.json(createSuccessResponse(records, 'Documents retrieved'));
  });

  createDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await candidateProfileService.createDocument(companyId, req.params.candidateId!, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Document created'));
  });

  deleteDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await candidateProfileService.deleteDocument(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Document deleted'));
  });
}

export const candidateProfileController = new CandidateProfileController();
