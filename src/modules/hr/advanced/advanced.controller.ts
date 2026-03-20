import { Request, Response } from 'express';
import { advancedHRService } from './advanced.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createRequisitionSchema,
  updateRequisitionSchema,
  updateRequisitionStatusSchema,
  createCandidateSchema,
  updateCandidateSchema,
  advanceCandidateStageSchema,
  createInterviewSchema,
  updateInterviewSchema,
  completeInterviewSchema,
  createTrainingCatalogueSchema,
  updateTrainingCatalogueSchema,
  createTrainingNominationSchema,
  updateTrainingNominationSchema,
  completeTrainingNominationSchema,
  createAssetCategorySchema,
  updateAssetCategorySchema,
  createAssetSchema,
  updateAssetSchema,
  createAssetAssignmentSchema,
  returnAssetSchema,
  createExpenseClaimSchema,
  updateExpenseClaimSchema,
  approveRejectClaimSchema,
  createLetterTemplateSchema,
  updateLetterTemplateSchema,
  createLetterSchema,
  createGrievanceCategorySchema,
  updateGrievanceCategorySchema,
  createGrievanceCaseSchema,
  updateGrievanceCaseSchema,
  resolveGrievanceCaseSchema,
  createDisciplinaryActionSchema,
  updateDisciplinaryActionSchema,
} from './advanced.validators';

export class AdvancedHRController {
  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Requisitions
  // ════════════════════════════════════════════════════════════════

  listRequisitions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.departmentId) opts.departmentId = req.query.departmentId as string;

    const result = await advancedHRService.listRequisitions(companyId, opts);
    res.json(createPaginatedResponse(result.requisitions, result.page, result.limit, result.total, 'Job requisitions retrieved'));
  });

  getRequisition = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const requisition = await advancedHRService.getRequisition(companyId, req.params.id!);
    res.json(createSuccessResponse(requisition, 'Job requisition retrieved'));
  });

  createRequisition = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createRequisitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const requisition = await advancedHRService.createRequisition(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(requisition, 'Job requisition created'));
  });

  updateRequisition = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateRequisitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const requisition = await advancedHRService.updateRequisition(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(requisition, 'Job requisition updated'));
  });

  updateRequisitionStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateRequisitionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const requisition = await advancedHRService.updateRequisitionStatus(companyId, req.params.id!, parsed.data.status);
    res.json(createSuccessResponse(requisition, 'Requisition status updated'));
  });

  deleteRequisition = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteRequisition(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Job requisition deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Candidates
  // ════════════════════════════════════════════════════════════════

  listCandidates = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.requisitionId) opts.requisitionId = req.query.requisitionId as string;
    if (req.query.stage) opts.stage = req.query.stage as string;

    const result = await advancedHRService.listCandidates(companyId, opts);
    res.json(createPaginatedResponse(result.candidates, result.page, result.limit, result.total, 'Candidates retrieved'));
  });

  getCandidate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const candidate = await advancedHRService.getCandidate(companyId, req.params.id!);
    res.json(createSuccessResponse(candidate, 'Candidate retrieved'));
  });

  createCandidate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createCandidateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const candidate = await advancedHRService.createCandidate(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(candidate, 'Candidate created'));
  });

  updateCandidate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateCandidateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const candidate = await advancedHRService.updateCandidate(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(candidate, 'Candidate updated'));
  });

  advanceCandidateStage = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = advanceCandidateStageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const candidate = await advancedHRService.advanceCandidateStage(companyId, req.params.id!, parsed.data.stage);
    res.json(createSuccessResponse(candidate, 'Candidate stage updated'));
  });

  deleteCandidate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteCandidate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Candidate deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Interviews
  // ════════════════════════════════════════════════════════════════

  listInterviews = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.candidateId) opts.candidateId = req.query.candidateId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await advancedHRService.listInterviews(companyId, opts);
    res.json(createPaginatedResponse(result.interviews, result.page, result.limit, result.total, 'Interviews retrieved'));
  });

  getInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const interview = await advancedHRService.getInterview(companyId, req.params.id!);
    res.json(createSuccessResponse(interview, 'Interview retrieved'));
  });

  createInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createInterviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const interview = await advancedHRService.createInterview(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(interview, 'Interview scheduled'));
  });

  updateInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateInterviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const interview = await advancedHRService.updateInterview(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(interview, 'Interview updated'));
  });

  completeInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = completeInterviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const interview = await advancedHRService.completeInterview(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(interview, 'Interview completed'));
  });

  cancelInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const interview = await advancedHRService.cancelInterview(companyId, req.params.id!);
    res.json(createSuccessResponse(interview, 'Interview cancelled'));
  });

  deleteInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteInterview(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Interview deleted'));
  });

  getRecruitmentDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const dashboard = await advancedHRService.getRecruitmentDashboard(companyId);
    res.json(createSuccessResponse(dashboard, 'Recruitment dashboard retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // TRAINING — Catalogue
  // ════════════════════════════════════════════════════════════════

  listTrainingCatalogues = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.type) opts.type = req.query.type as string;
    if (req.query.mandatory !== undefined) opts.mandatory = req.query.mandatory === 'true';

    const result = await advancedHRService.listTrainingCatalogues(companyId, opts);
    res.json(createPaginatedResponse(result.catalogues, result.page, result.limit, result.total, 'Training catalogues retrieved'));
  });

  getTrainingCatalogue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const catalogue = await advancedHRService.getTrainingCatalogue(companyId, req.params.id!);
    res.json(createSuccessResponse(catalogue, 'Training catalogue retrieved'));
  });

  createTrainingCatalogue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTrainingCatalogueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const catalogue = await advancedHRService.createTrainingCatalogue(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(catalogue, 'Training catalogue created'));
  });

  updateTrainingCatalogue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateTrainingCatalogueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const catalogue = await advancedHRService.updateTrainingCatalogue(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(catalogue, 'Training catalogue updated'));
  });

  deleteTrainingCatalogue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteTrainingCatalogue(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Training catalogue deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // TRAINING — Nominations
  // ════════════════════════════════════════════════════════════════

  listTrainingNominations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.trainingId) opts.trainingId = req.query.trainingId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await advancedHRService.listTrainingNominations(companyId, opts);
    res.json(createPaginatedResponse(result.nominations, result.page, result.limit, result.total, 'Training nominations retrieved'));
  });

  getTrainingNomination = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const nomination = await advancedHRService.getTrainingNomination(companyId, req.params.id!);
    res.json(createSuccessResponse(nomination, 'Training nomination retrieved'));
  });

  createTrainingNomination = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTrainingNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const nomination = await advancedHRService.createTrainingNomination(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(nomination, 'Training nomination created'));
  });

  updateTrainingNomination = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateTrainingNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const nomination = await advancedHRService.updateTrainingNomination(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(nomination, 'Training nomination updated'));
  });

  completeTrainingNomination = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = completeTrainingNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const nomination = await advancedHRService.completeTrainingNomination(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(nomination, 'Training nomination completed'));
  });

  deleteTrainingNomination = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteTrainingNomination(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Training nomination deleted'));
  });

  getTrainingDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const dashboard = await advancedHRService.getTrainingDashboard(companyId);
    res.json(createSuccessResponse(dashboard, 'Training dashboard retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Categories
  // ════════════════════════════════════════════════════════════════

  listAssetCategories = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await advancedHRService.listAssetCategories(companyId, { page, limit });
    res.json(createPaginatedResponse(result.categories, result.page, result.limit, result.total, 'Asset categories retrieved'));
  });

  getAssetCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const category = await advancedHRService.getAssetCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(category, 'Asset category retrieved'));
  });

  createAssetCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createAssetCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await advancedHRService.createAssetCategory(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(category, 'Asset category created'));
  });

  updateAssetCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateAssetCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await advancedHRService.updateAssetCategory(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(category, 'Asset category updated'));
  });

  deleteAssetCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteAssetCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Asset category deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Assets
  // ════════════════════════════════════════════════════════════════

  listAssets = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.categoryId) opts.categoryId = req.query.categoryId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await advancedHRService.listAssets(companyId, opts);
    res.json(createPaginatedResponse(result.assets, result.page, result.limit, result.total, 'Assets retrieved'));
  });

  getAsset = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const asset = await advancedHRService.getAsset(companyId, req.params.id!);
    res.json(createSuccessResponse(asset, 'Asset retrieved'));
  });

  createAsset = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const asset = await advancedHRService.createAsset(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(asset, 'Asset created'));
  });

  updateAsset = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const asset = await advancedHRService.updateAsset(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(asset, 'Asset updated'));
  });

  deleteAsset = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteAsset(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Asset deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Assignments
  // ════════════════════════════════════════════════════════════════

  listAssetAssignments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.assetId) opts.assetId = req.query.assetId as string;
    if (req.query.active !== undefined) opts.active = req.query.active === 'true';

    const result = await advancedHRService.listAssetAssignments(companyId, opts);
    res.json(createPaginatedResponse(result.assignments, result.page, result.limit, result.total, 'Asset assignments retrieved'));
  });

  createAssetAssignment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createAssetAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const assignment = await advancedHRService.createAssetAssignment(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(assignment, 'Asset assigned'));
  });

  returnAssetAssignment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = returnAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const assignment = await advancedHRService.returnAssetAssignment(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(assignment, 'Asset returned'));
  });

  // ════════════════════════════════════════════════════════════════
  // EXPENSE CLAIMS
  // ════════════════════════════════════════════════════════════════

  listExpenseClaims = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.category) opts.category = req.query.category as string;

    const result = await advancedHRService.listExpenseClaims(companyId, opts);
    res.json(createPaginatedResponse(result.claims, result.page, result.limit, result.total, 'Expense claims retrieved'));
  });

  getExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const claim = await advancedHRService.getExpenseClaim(companyId, req.params.id!);
    res.json(createSuccessResponse(claim, 'Expense claim retrieved'));
  });

  createExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createExpenseClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const claim = await advancedHRService.createExpenseClaim(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(claim, 'Expense claim created'));
  });

  updateExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateExpenseClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const claim = await advancedHRService.updateExpenseClaim(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(claim, 'Expense claim updated'));
  });

  submitExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const claim = await advancedHRService.submitExpenseClaim(companyId, req.params.id!);
    res.json(createSuccessResponse(claim, 'Expense claim submitted'));
  });

  approveRejectExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveRejectClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const claim = await advancedHRService.approveRejectExpenseClaim(
      companyId, req.params.id!, parsed.data.action, parsed.data.approvedBy,
    );
    res.json(createSuccessResponse(claim, `Expense claim ${parsed.data.action}d`));
  });

  deleteExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteExpenseClaim(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Expense claim deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // HR LETTER TEMPLATES
  // ════════════════════════════════════════════════════════════════

  listLetterTemplates = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await advancedHRService.listLetterTemplates(companyId, { page, limit });
    res.json(createPaginatedResponse(result.templates, result.page, result.limit, result.total, 'Letter templates retrieved'));
  });

  getLetterTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const template = await advancedHRService.getLetterTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(template, 'Letter template retrieved'));
  });

  createLetterTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLetterTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const template = await advancedHRService.createLetterTemplate(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(template, 'Letter template created'));
  });

  updateLetterTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLetterTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const template = await advancedHRService.updateLetterTemplate(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(template, 'Letter template updated'));
  });

  deleteLetterTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteLetterTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Letter template deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // HR LETTERS
  // ════════════════════════════════════════════════════════════════

  listLetters = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.templateId) opts.templateId = req.query.templateId as string;

    const result = await advancedHRService.listLetters(companyId, opts);
    res.json(createPaginatedResponse(result.letters, result.page, result.limit, result.total, 'HR letters retrieved'));
  });

  getLetter = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const letter = await advancedHRService.getLetter(companyId, req.params.id!);
    res.json(createSuccessResponse(letter, 'HR letter retrieved'));
  });

  createLetter = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLetterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const letter = await advancedHRService.createLetter(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(letter, 'HR letter created'));
  });

  deleteLetter = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteLetter(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'HR letter deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // GRIEVANCE — Categories
  // ════════════════════════════════════════════════════════════════

  listGrievanceCategories = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await advancedHRService.listGrievanceCategories(companyId, { page, limit });
    res.json(createPaginatedResponse(result.categories, result.page, result.limit, result.total, 'Grievance categories retrieved'));
  });

  getGrievanceCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const category = await advancedHRService.getGrievanceCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(category, 'Grievance category retrieved'));
  });

  createGrievanceCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGrievanceCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await advancedHRService.createGrievanceCategory(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(category, 'Grievance category created'));
  });

  updateGrievanceCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGrievanceCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await advancedHRService.updateGrievanceCategory(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(category, 'Grievance category updated'));
  });

  deleteGrievanceCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteGrievanceCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Grievance category deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // GRIEVANCE — Cases
  // ════════════════════════════════════════════════════════════════

  listGrievanceCases = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.categoryId) opts.categoryId = req.query.categoryId as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;

    const result = await advancedHRService.listGrievanceCases(companyId, opts);
    res.json(createPaginatedResponse(result.cases, result.page, result.limit, result.total, 'Grievance cases retrieved'));
  });

  getGrievanceCase = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const gCase = await advancedHRService.getGrievanceCase(companyId, req.params.id!);
    res.json(createSuccessResponse(gCase, 'Grievance case retrieved'));
  });

  createGrievanceCase = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGrievanceCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const gCase = await advancedHRService.createGrievanceCase(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(gCase, 'Grievance case created'));
  });

  updateGrievanceCase = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGrievanceCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const gCase = await advancedHRService.updateGrievanceCase(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(gCase, 'Grievance case updated'));
  });

  resolveGrievanceCase = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = resolveGrievanceCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const gCase = await advancedHRService.resolveGrievanceCase(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(gCase, 'Grievance case resolved'));
  });

  deleteGrievanceCase = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteGrievanceCase(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Grievance case deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // DISCIPLINARY ACTIONS
  // ════════════════════════════════════════════════════════════════

  listDisciplinaryActions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.type) opts.type = req.query.type as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await advancedHRService.listDisciplinaryActions(companyId, opts);
    res.json(createPaginatedResponse(result.actions, result.page, result.limit, result.total, 'Disciplinary actions retrieved'));
  });

  getDisciplinaryAction = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const action = await advancedHRService.getDisciplinaryAction(companyId, req.params.id!);
    res.json(createSuccessResponse(action, 'Disciplinary action retrieved'));
  });

  createDisciplinaryAction = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDisciplinaryActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const action = await advancedHRService.createDisciplinaryAction(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(action, 'Disciplinary action created'));
  });

  updateDisciplinaryAction = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateDisciplinaryActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const action = await advancedHRService.updateDisciplinaryAction(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(action, 'Disciplinary action updated'));
  });

  deleteDisciplinaryAction = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await advancedHRService.deleteDisciplinaryAction(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Disciplinary action deleted'));
  });
}

export const advancedHRController = new AdvancedHRController();
