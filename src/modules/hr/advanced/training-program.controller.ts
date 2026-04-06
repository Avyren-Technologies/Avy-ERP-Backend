import { Request, Response } from 'express';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { trainingProgramService } from './training-program.service';
import { createProgramSchema, updateProgramSchema, addCourseSchema, enrollSchema } from './training-program.validators';

class TrainingProgramController {
  // ════════════════════════════════════════════════════════════════
  // LIST PROGRAMS
  // ════════════════════════════════════════════════════════════════

  listPrograms = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.category) opts.category = req.query.category as string;
    if (req.query.isActive !== undefined) opts.isActive = req.query.isActive === 'true';

    const result = await trainingProgramService.listPrograms(companyId, opts);
    res.json(createPaginatedResponse(result.programs, result.page, result.limit, result.total, 'Training programs retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // GET PROGRAM
  // ════════════════════════════════════════════════════════════════

  getProgram = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const program = await trainingProgramService.getProgram(companyId, req.params.id!);
    res.json(createSuccessResponse(program, 'Training program retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // CREATE PROGRAM
  // ════════════════════════════════════════════════════════════════

  createProgram = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const program = await trainingProgramService.createProgram(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(program, 'Training program created'));
  });

  // ════════════════════════════════════════════════════════════════
  // UPDATE PROGRAM
  // ════════════════════════════════════════════════════════════════

  updateProgram = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const program = await trainingProgramService.updateProgram(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(program, 'Training program updated'));
  });

  // ════════════════════════════════════════════════════════════════
  // DELETE PROGRAM
  // ════════════════════════════════════════════════════════════════

  deleteProgram = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await trainingProgramService.deleteProgram(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Training program deleted'));
  });

  // ════════════════════════════════════════════════════════════════
  // ADD COURSE
  // ════════════════════════════════════════════════════════════════

  addCourse = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = addCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const course = await trainingProgramService.addCourse(companyId, req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(course, 'Course added to program'));
  });

  // ════════════════════════════════════════════════════════════════
  // REMOVE COURSE
  // ════════════════════════════════════════════════════════════════

  removeCourse = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await trainingProgramService.removeCourse(companyId, req.params.id!, req.params.courseId!);
    res.json(createSuccessResponse(result, 'Course removed from program'));
  });

  // ════════════════════════════════════════════════════════════════
  // ENROLL EMPLOYEES
  // ════════════════════════════════════════════════════════════════

  enrollEmployees = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await trainingProgramService.enrollEmployees(companyId, req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Employees enrolled'));
  });

  // ════════════════════════════════════════════════════════════════
  // LIST ENROLLMENTS
  // ════════════════════════════════════════════════════════════════

  listEnrollments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const enrollments = await trainingProgramService.listEnrollments(companyId, req.params.id!);
    res.json(createSuccessResponse(enrollments, 'Enrollments retrieved'));
  });
}

export const trainingProgramController = new TrainingProgramController();
