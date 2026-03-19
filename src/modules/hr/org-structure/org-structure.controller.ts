import { Request, Response } from 'express';
import { orgStructureService } from './org-structure.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createDesignationSchema,
  updateDesignationSchema,
  createGradeSchema,
  updateGradeSchema,
  createEmployeeTypeSchema,
  updateEmployeeTypeSchema,
  createCostCentreSchema,
  updateCostCentreSchema,
} from './org-structure.validators';

export class OrgStructureController {
  // ── Departments ───────────────────────────────────────────────────

  listDepartments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string; status?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await orgStructureService.listDepartments(companyId, opts);
    res.json(createPaginatedResponse(result.departments, result.page, result.limit, result.total, 'Departments retrieved'));
  });

  getDepartment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const department = await orgStructureService.getDepartment(companyId, req.params.id!);
    res.json(createSuccessResponse(department, 'Department retrieved'));
  });

  createDepartment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDepartmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const department = await orgStructureService.createDepartment(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(department, 'Department created'));
  });

  updateDepartment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateDepartmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const department = await orgStructureService.updateDepartment(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(department, 'Department updated'));
  });

  deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await orgStructureService.deleteDepartment(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Department deleted'));
  });

  // ── Designations ──────────────────────────────────────────────────

  listDesignations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string; status?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await orgStructureService.listDesignations(companyId, opts);
    res.json(createPaginatedResponse(result.designations, result.page, result.limit, result.total, 'Designations retrieved'));
  });

  getDesignation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const designation = await orgStructureService.getDesignation(companyId, req.params.id!);
    res.json(createSuccessResponse(designation, 'Designation retrieved'));
  });

  createDesignation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDesignationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const designation = await orgStructureService.createDesignation(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(designation, 'Designation created'));
  });

  updateDesignation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateDesignationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const designation = await orgStructureService.updateDesignation(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(designation, 'Designation updated'));
  });

  deleteDesignation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await orgStructureService.deleteDesignation(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Designation deleted'));
  });

  // ── Grades ────────────────────────────────────────────────────────

  listGrades = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string; status?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await orgStructureService.listGrades(companyId, opts);
    res.json(createPaginatedResponse(result.grades, result.page, result.limit, result.total, 'Grades retrieved'));
  });

  getGrade = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const grade = await orgStructureService.getGrade(companyId, req.params.id!);
    res.json(createSuccessResponse(grade, 'Grade retrieved'));
  });

  createGrade = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGradeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const grade = await orgStructureService.createGrade(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(grade, 'Grade created'));
  });

  updateGrade = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGradeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const grade = await orgStructureService.updateGrade(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(grade, 'Grade updated'));
  });

  deleteGrade = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await orgStructureService.deleteGrade(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Grade deleted'));
  });

  // ── Employee Types ────────────────────────────────────────────────

  listEmployeeTypes = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string; status?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await orgStructureService.listEmployeeTypes(companyId, opts);
    res.json(createPaginatedResponse(result.employeeTypes, result.page, result.limit, result.total, 'Employee types retrieved'));
  });

  getEmployeeType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeType = await orgStructureService.getEmployeeType(companyId, req.params.id!);
    res.json(createSuccessResponse(employeeType, 'Employee type retrieved'));
  });

  createEmployeeType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createEmployeeTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const employeeType = await orgStructureService.createEmployeeType(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(employeeType, 'Employee type created'));
  });

  updateEmployeeType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateEmployeeTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const employeeType = await orgStructureService.updateEmployeeType(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(employeeType, 'Employee type updated'));
  });

  deleteEmployeeType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await orgStructureService.deleteEmployeeType(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Employee type deleted'));
  });

  // ── Cost Centres ──────────────────────────────────────────────────

  listCostCentres = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;

    const result = await orgStructureService.listCostCentres(companyId, opts);
    res.json(createPaginatedResponse(result.costCentres, result.page, result.limit, result.total, 'Cost centres retrieved'));
  });

  getCostCentre = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const costCentre = await orgStructureService.getCostCentre(companyId, req.params.id!);
    res.json(createSuccessResponse(costCentre, 'Cost centre retrieved'));
  });

  createCostCentre = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createCostCentreSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const costCentre = await orgStructureService.createCostCentre(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(costCentre, 'Cost centre created'));
  });

  updateCostCentre = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateCostCentreSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const costCentre = await orgStructureService.updateCostCentre(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(costCentre, 'Cost centre updated'));
  });

  deleteCostCentre = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await orgStructureService.deleteCostCentre(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Cost centre deleted'));
  });
}

export const orgStructureController = new OrgStructureController();
