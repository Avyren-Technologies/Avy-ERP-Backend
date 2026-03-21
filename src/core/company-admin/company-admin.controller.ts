import { Request, Response } from 'express';
import { companyAdminService } from './company-admin.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import {
  updateLocationSchema,
  createShiftSchema,
  updateShiftSchema,
  createContactSchema,
  updateContactSchema,
  createNoSeriesSchema,
  updateNoSeriesSchema,
  createIotReasonSchema,
  updateIotReasonSchema,
  updateControlsSchema,
  updateSettingsSchema,
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  profileSectionSchemas,
} from './company-admin.validators';

export class CompanyAdminController {
  // ── Profile ─────────────────────────────────────────────────────────

  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const profile = await companyAdminService.getCompanyProfile(companyId);
    res.json(createSuccessResponse(profile, 'Company profile retrieved'));
  });

  updateProfileSection = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { sectionKey } = req.params;
    const schema = profileSectionSchemas[sectionKey!];
    if (!schema) {
      throw ApiError.badRequest(`Invalid section key: ${sectionKey}. Allowed: identity, address, contacts`);
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await companyAdminService.updateCompanySection(companyId, sectionKey!, parsed.data);
    res.json(createSuccessResponse(result, `Section "${sectionKey}" updated`));
  });

  // ── Locations ───────────────────────────────────────────────────────

  listLocations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const locations = await companyAdminService.listLocations(companyId);
    res.json(createSuccessResponse(locations, 'Locations retrieved'));
  });

  getLocation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const location = await companyAdminService.getLocation(companyId, req.params.id!);
    res.json(createSuccessResponse(location, 'Location retrieved'));
  });

  createLocation = asyncHandler(async (_req: Request, res: Response) => {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only Super Admin can add new locations. Contact your administrator.' },
    });
  });

  updateLocation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const location = await companyAdminService.updateLocation(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(location, 'Location updated'));
  });

  deleteLocation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await companyAdminService.deleteLocation(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Location deleted'));
  });

  // ── Shifts ──────────────────────────────────────────────────────────

  listShifts = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const shifts = await companyAdminService.listShifts(companyId);
    res.json(createSuccessResponse(shifts, 'Shifts retrieved'));
  });

  getShift = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const shift = await companyAdminService.getShift(companyId, req.params.id!);
    res.json(createSuccessResponse(shift, 'Shift retrieved'));
  });

  createShift = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const shift = await companyAdminService.createShift(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(shift, 'Shift created'));
  });

  updateShift = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const shift = await companyAdminService.updateShift(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(shift, 'Shift updated'));
  });

  deleteShift = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await companyAdminService.deleteShift(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Shift deleted'));
  });

  // ── Contacts ────────────────────────────────────────────────────────

  listContacts = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const contacts = await companyAdminService.listContacts(companyId);
    res.json(createSuccessResponse(contacts, 'Contacts retrieved'));
  });

  getContact = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const contact = await companyAdminService.getContact(companyId, req.params.id!);
    res.json(createSuccessResponse(contact, 'Contact retrieved'));
  });

  createContact = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const contact = await companyAdminService.createContact(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(contact, 'Contact created'));
  });

  updateContact = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const contact = await companyAdminService.updateContact(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(contact, 'Contact updated'));
  });

  deleteContact = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await companyAdminService.deleteContact(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Contact deleted'));
  });

  // ── No. Series ──────────────────────────────────────────────────────

  listNoSeries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const series = await companyAdminService.listNoSeries(companyId);
    res.json(createSuccessResponse(series, 'No. Series retrieved'));
  });

  getNoSeries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const ns = await companyAdminService.getNoSeries(companyId, req.params.id!);
    res.json(createSuccessResponse(ns, 'No. Series retrieved'));
  });

  createNoSeries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createNoSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const ns = await companyAdminService.createNoSeries(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(ns, 'No. Series created'));
  });

  updateNoSeries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateNoSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const ns = await companyAdminService.updateNoSeries(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(ns, 'No. Series updated'));
  });

  deleteNoSeries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await companyAdminService.deleteNoSeries(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'No. Series deleted'));
  });

  // ── IoT Reasons ─────────────────────────────────────────────────────

  listIotReasons = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const reasons = await companyAdminService.listIotReasons(companyId);
    res.json(createSuccessResponse(reasons, 'IoT Reasons retrieved'));
  });

  getIotReason = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const reason = await companyAdminService.getIotReason(companyId, req.params.id!);
    res.json(createSuccessResponse(reason, 'IoT Reason retrieved'));
  });

  createIotReason = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createIotReasonSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const reason = await companyAdminService.createIotReason(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(reason, 'IoT Reason created'));
  });

  updateIotReason = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateIotReasonSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const reason = await companyAdminService.updateIotReason(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(reason, 'IoT Reason updated'));
  });

  deleteIotReason = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await companyAdminService.deleteIotReason(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'IoT Reason deleted'));
  });

  // ── Controls ────────────────────────────────────────────────────────

  getControls = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const controls = await companyAdminService.getControls(companyId);
    res.json(createSuccessResponse(controls, 'System controls retrieved'));
  });

  updateControls = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateControlsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const controls = await companyAdminService.updateControls(companyId, parsed.data);
    res.json(createSuccessResponse(controls, 'System controls updated'));
  });

  // ── Settings ────────────────────────────────────────────────────────

  getSettings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const settings = await companyAdminService.getSettings(companyId);
    res.json(createSuccessResponse(settings, 'Settings retrieved'));
  });

  updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const settings = await companyAdminService.updateSettings(companyId, parsed.data);
    res.json(createSuccessResponse(settings, 'Settings updated'));
  });

  // ── Users ───────────────────────────────────────────────────────────

  listUsers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string; isActive?: boolean } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.isActive !== undefined) opts.isActive = req.query.isActive === 'true';

    const result = await companyAdminService.listUsers(companyId, opts);
    res.json(createPaginatedResponse(result.users, result.page, result.limit, result.total, 'Users retrieved'));
  });

  createUser = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const tenantId = req.user?.tenantId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const user = await companyAdminService.createUser(companyId, tenantId || '', parsed.data);
    res.status(201).json(createSuccessResponse(user, 'User created'));
  });

  getUser = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const user = await companyAdminService.getUser(companyId, req.params.id!);
    res.json(createSuccessResponse(user, 'User retrieved'));
  });

  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const user = await companyAdminService.updateUser(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(user, 'User updated'));
  });

  updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateUserStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const user = await companyAdminService.updateUserStatus(companyId, req.params.id!, parsed.data.isActive);
    res.json(createSuccessResponse(user, `User ${parsed.data.isActive ? 'activated' : 'deactivated'}`));
  });

  // ── Audit Logs ──────────────────────────────────────────────────────

  listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw ApiError.badRequest('Tenant context is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; action?: string; entityType?: string } = { page, limit };
    if (req.query.action) opts.action = req.query.action as string;
    if (req.query.entityType) opts.entityType = req.query.entityType as string;

    const result = await companyAdminService.listAuditLogs(tenantId, opts);
    res.json(createPaginatedResponse(result.logs, result.page, result.limit, result.total, 'Audit logs retrieved'));
  });

  getAuditFilterOptions = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw ApiError.badRequest('Tenant context is required');

    const filters = await companyAdminService.getAuditFilterOptions(tenantId);
    res.json(createSuccessResponse(filters, 'Filter options retrieved successfully'));
  });
}

export const companyAdminController = new CompanyAdminController();
