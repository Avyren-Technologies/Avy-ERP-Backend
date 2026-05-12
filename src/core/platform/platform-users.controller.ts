import { Request, Response } from 'express';
import { platformUsersService } from './platform-users.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import {
  listPlatformUsersSchema,
  createPlatformUserSchema,
  updatePlatformUserSchema,
  resetPasswordSchema,
  updateStatusSchema,
} from './platform-users.validators';

export class PlatformUsersController {
  // ── List all users ─────────────────────────────────────────────────
  listUsers = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const parsed = listPlatformUsersSchema.safeParse({ ...req.query, page, limit });
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await platformUsersService.listUsers(parsed.data);
    res.json(createPaginatedResponse(result.users, result.page, result.limit, result.total, 'Users retrieved successfully'));
  });

  // ── Get single user ────────────────────────────────────────────────
  getUser = asyncHandler(async (req: Request, res: Response) => {
    const user = await platformUsersService.getUserById(req.params.id!);
    res.json(createSuccessResponse(user, 'User retrieved successfully'));
  });

  // ── Create user ────────────────────────────────────────────────────
  createUser = asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPlatformUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const user = await platformUsersService.createUser(parsed.data);
    res.status(201).json(createSuccessResponse(user, 'User created successfully'));
  });

  // ── Update user ────────────────────────────────────────────────────
  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const parsed = updatePlatformUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const user = await platformUsersService.updateUser(req.params.id!, parsed.data);
    res.json(createSuccessResponse(user, 'User updated successfully'));
  });

  // ── Reset password ─────────────────────────────────────────────────
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await platformUsersService.resetPassword(req.params.id!, parsed.data.password);
    res.json(createSuccessResponse(result, 'Password reset successfully'));
  });

  // ── Toggle status ──────────────────────────────────────────────────
  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const user = await platformUsersService.updateStatus(req.params.id!, parsed.data.isActive);
    res.json(createSuccessResponse(user, `User ${parsed.data.isActive ? 'activated' : 'deactivated'} successfully`));
  });

  // ── Delete user ────────────────────────────────────────────────────
  deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const result = await platformUsersService.deleteUser(req.params.id!);
    res.json(createSuccessResponse(result, 'User deleted successfully'));
  });

  // ── Stats ──────────────────────────────────────────────────────────
  getStats = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await platformUsersService.getStats();
    res.json(createSuccessResponse(stats, 'User stats retrieved successfully'));
  });

  // ── Companies list (for filters) ──────────────────────────────────
  listCompanies = asyncHandler(async (_req: Request, res: Response) => {
    const companies = await platformUsersService.listCompanies();
    res.json(createSuccessResponse(companies, 'Companies retrieved successfully'));
  });
}

export const platformUsersController = new PlatformUsersController();
