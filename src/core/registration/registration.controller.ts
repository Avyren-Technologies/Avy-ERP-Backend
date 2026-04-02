import { Request, Response } from 'express';
import { registrationService } from './registration.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { registerCompanySchema, updateRegistrationSchema } from './registration.validators';
import type { RegistrationRequestStatus } from '@prisma/client';

export class RegistrationController {
  // Public — submit a new company registration
  submitRegistration = asyncHandler(async (req: Request, res: Response) => {
    const parsed = registerCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await registrationService.submitRegistration(parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Registration request submitted successfully'));
  });

  // Super admin — list all registration requests
  listRegistrations = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const statusParam = req.query.status as string | undefined;

    const { requests, total } = await registrationService.listRegistrations({
      ...(statusParam ? { status: statusParam as RegistrationRequestStatus } : {}),
      page,
      limit,
      offset,
    });

    res.json(createPaginatedResponse(requests, page, limit, total, 'Registration requests retrieved'));
  });

  // Super admin — get single registration request
  getRegistration = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Registration ID is required');
    const result = await registrationService.getRegistration(id);
    res.json(createSuccessResponse(result, 'Registration request retrieved'));
  });

  // Super admin — approve or reject a registration request
  updateRegistration = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Registration ID is required');
    const parsed = updateRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await registrationService.updateRegistration(id, parsed.data);
    const action = parsed.data.status === 'APPROVED' ? 'approved' : 'rejected';
    res.json(createSuccessResponse(result, `Registration request ${action}`));
  });
}

export const registrationController = new RegistrationController();
