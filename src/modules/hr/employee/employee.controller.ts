import { Request, Response } from 'express';
import { employeeService } from './employee.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createEmployeeWithUserSchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
  createNomineeSchema,
  updateNomineeSchema,
  createEducationSchema,
  updateEducationSchema,
  createPrevEmploymentSchema,
  updatePrevEmploymentSchema,
  createDocumentSchema,
  updateDocumentSchema,
} from './employee.validators';
import { probationReviewSchema } from '../onboarding/onboarding.validators';

export class EmployeeController {
  // ── Employee CRUD ─────────────────────────────────────────────────────

  listEmployees = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.departmentId) opts.departmentId = req.query.departmentId as string;
    if (req.query.designationId) opts.designationId = req.query.designationId as string;
    if (req.query.locationId) opts.locationId = req.query.locationId as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.employeeTypeId) opts.employeeTypeId = req.query.employeeTypeId as string;
    if (req.query.sortBy) opts.sortBy = req.query.sortBy as string;
    if (req.query.sortOrder) opts.sortOrder = req.query.sortOrder as string;

    const result = await employeeService.listEmployees(companyId, opts);
    res.json(createPaginatedResponse(result.employees, result.page, result.limit, result.total, 'Employees retrieved'));
  });

  createEmployee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createEmployeeWithUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const employee = await employeeService.createEmployee(companyId, parsed.data, req.user?.id);
    res.status(201).json(createSuccessResponse(employee, 'Employee created'));
  });

  getEmployee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employee = await employeeService.getEmployee(companyId, req.params.id!);
    res.json(createSuccessResponse(employee, 'Employee retrieved'));
  });

  updateEmployee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const employee = await employeeService.updateEmployee(companyId, req.params.id!, parsed.data, req.user?.id);
    res.json(createSuccessResponse(employee, 'Employee updated'));
  });

  updateEmployeeStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateEmployeeStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const employee = await employeeService.updateEmployeeStatus(companyId, req.params.id!, parsed.data, req.user?.id);
    res.json(createSuccessResponse(employee, `Employee status updated to ${parsed.data.status}`));
  });

  deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await employeeService.deleteEmployee(companyId, req.params.id!, req.user?.id);
    res.json(createSuccessResponse(result, 'Employee deactivated'));
  });

  // ── Nominees ──────────────────────────────────────────────────────────

  listNominees = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    // Verify employee belongs to company
    await employeeService.getEmployee(companyId, req.params.id!);

    const nominees = await employeeService.listNominees(req.params.id!);
    res.json(createSuccessResponse(nominees, 'Nominees retrieved'));
  });

  addNominee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = createNomineeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const nominee = await employeeService.addNominee(req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(nominee, 'Nominee added'));
  });

  updateNominee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = updateNomineeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const nominee = await employeeService.updateNominee(req.params.id!, req.params.nid!, parsed.data);
    res.json(createSuccessResponse(nominee, 'Nominee updated'));
  });

  deleteNominee = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const result = await employeeService.deleteNominee(req.params.id!, req.params.nid!);
    res.json(createSuccessResponse(result, 'Nominee deleted'));
  });

  // ── Education ─────────────────────────────────────────────────────────

  listEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const education = await employeeService.listEducation(req.params.id!);
    res.json(createSuccessResponse(education, 'Education records retrieved'));
  });

  addEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = createEducationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const education = await employeeService.addEducation(req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(education, 'Education record added'));
  });

  updateEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = updateEducationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const education = await employeeService.updateEducation(req.params.id!, req.params.eid!, parsed.data);
    res.json(createSuccessResponse(education, 'Education record updated'));
  });

  deleteEducation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const result = await employeeService.deleteEducation(req.params.id!, req.params.eid!);
    res.json(createSuccessResponse(result, 'Education record deleted'));
  });

  // ── Previous Employment ───────────────────────────────────────────────

  listPrevEmployment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const records = await employeeService.listPrevEmployment(req.params.id!);
    res.json(createSuccessResponse(records, 'Previous employment records retrieved'));
  });

  addPrevEmployment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = createPrevEmploymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const record = await employeeService.addPrevEmployment(req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Previous employment record added'));
  });

  updatePrevEmployment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = updatePrevEmploymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const record = await employeeService.updatePrevEmployment(req.params.id!, req.params.pid!, parsed.data);
    res.json(createSuccessResponse(record, 'Previous employment record updated'));
  });

  deletePrevEmployment = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const result = await employeeService.deletePrevEmployment(req.params.id!, req.params.pid!);
    res.json(createSuccessResponse(result, 'Previous employment record deleted'));
  });

  // ── Documents ─────────────────────────────────────────────────────────

  listDocuments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const documents = await employeeService.listDocuments(req.params.id!);
    res.json(createSuccessResponse(documents, 'Documents retrieved'));
  });

  addDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const document = await employeeService.addDocument(req.params.id!, parsed.data, req.user?.id);
    res.status(201).json(createSuccessResponse(document, 'Document added'));
  });

  updateDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const document = await employeeService.updateDocument(req.params.id!, req.params.did!, parsed.data);
    res.json(createSuccessResponse(document, 'Document updated'));
  });

  deleteDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const result = await employeeService.deleteDocument(req.params.id!, req.params.did!);
    res.json(createSuccessResponse(result, 'Document deleted'));
  });

  // ── Timeline ──────────────────────────────────────────────────────────

  getTimeline = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    await employeeService.getEmployee(companyId, req.params.id!);

    const timeline = await employeeService.getTimeline(req.params.id!);
    res.json(createSuccessResponse(timeline, 'Timeline retrieved'));
  });

  // ── Probation (RED-7) ──────────────────────────────────────────────

  listProbationDue = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employees = await employeeService.listProbationDue(companyId);
    res.json(createSuccessResponse(employees, 'Probation-due employees retrieved'));
  });

  submitProbationReview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = probationReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const review = await employeeService.submitProbationReview(
      companyId,
      req.params.id!,
      parsed.data as any,
      req.user?.id,
    );
    res.status(201).json(createSuccessResponse(review, 'Probation review submitted'));
  });

  // ── Org Chart (ORA-10) ─────────────────────────────────────────────

  getOrgChart = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const orgChart = await employeeService.getOrgChart(companyId);
    res.json(createSuccessResponse(orgChart, 'Org chart retrieved'));
  });
}

export const employeeController = new EmployeeController();
