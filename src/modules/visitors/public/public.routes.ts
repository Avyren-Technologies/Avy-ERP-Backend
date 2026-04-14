import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../../middleware/error.middleware';
import { createSuccessResponse } from '../../../shared/utils';
import { ApiError } from '../../../shared/errors';
import { visitorPublicService } from './public.service';

const router = Router();

// ── Rate limiters for public endpoints ─────────────────────────────
const selfRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Too many registration attempts. Please try again later.',
    code: 'VMS_SELF_REG_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const preArrivalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    code: 'VMS_PRE_ARRIVAL_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const selfCheckOutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Too many check-out attempts. Please try again later.',
    code: 'VMS_SELF_CHECKOUT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Pre-Arrival Form ────────────────────────────────────────────────

/** GET /public/visit/:visitCode — Get visit details for pre-arrival form */
router.get(
  '/visit/:visitCode',
  asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const result = await visitorPublicService.getVisitByCode(visitCode);
    res.json(createSuccessResponse(result, 'Visit details retrieved'));
  }),
);

/** POST /public/visit/:visitCode/pre-arrival — Submit pre-arrival form */
router.post(
  '/visit/:visitCode/pre-arrival',
  preArrivalLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const schema = z.object({
      visitorPhoto: z.string().optional(),
      governmentIdType: z.string().optional(),
      governmentIdNumber: z.string().optional(),
      idDocumentPhoto: z.string().optional(),
      vehicleRegNumber: z.string().max(20).optional(),
      vehicleType: z.string().optional(),
      emergencyContact: z.string().optional(),
      ndaSigned: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }
    const result = await visitorPublicService.submitPreArrivalForm(visitCode, parsed.data);
    res.json(createSuccessResponse(result, 'Pre-arrival form submitted'));
  }),
);

// ── Self-Registration ───────────────────────────────────────────────

/** GET /public/visit/register/:plantCode — Get self-registration form config */
router.get(
  '/visit/register/:plantCode',
  asyncHandler(async (req: Request, res: Response) => {
    const plantCode = req.params.plantCode;
    if (!plantCode) throw ApiError.badRequest('Plant code is required');
    const result = await visitorPublicService.getSelfRegistrationConfig(plantCode);
    res.json(createSuccessResponse(result, 'Self-registration form config'));
  }),
);

/** POST /public/visit/register/:plantCode — Submit self-registration */
router.post(
  '/visit/register/:plantCode',
  selfRegistrationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const plantCode = req.params.plantCode;
    if (!plantCode) throw ApiError.badRequest('Plant code is required');
    const schema = z.object({
      visitorName: z.string().min(1).max(200),
      visitorMobile: z.string().min(10).max(15),
      visitorCompany: z.string().max(200).optional(),
      purpose: z.string().min(1).max(500),
      hostEmployeeName: z.string().min(1).max(200),
      visitorPhoto: z.string().optional(),
      visitorTypeId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }
    const result = await visitorPublicService.submitSelfRegistration(plantCode, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Registration submitted'));
  }),
);

// ── Visit Status ────────────────────────────────────────────────────

/** GET /public/visit/:visitCode/status — Check visit approval status */
router.get(
  '/visit/:visitCode/status',
  asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const result = await visitorPublicService.getVisitStatus(visitCode);
    res.json(createSuccessResponse(result, 'Visit status retrieved'));
  }),
);

// ── Digital Badge ───────────────────────────────────────────────────

/** GET /public/visit/:visitCode/badge — View digital badge */
router.get(
  '/visit/:visitCode/badge',
  asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const result = await visitorPublicService.getDigitalBadge(visitCode);
    res.json(createSuccessResponse(result, 'Digital badge retrieved'));
  }),
);

// ── Self Check-Out ──────────────────────────────────────────────────

/** POST /public/visit/:visitCode/check-out — Self-service check-out */
router.post(
  '/visit/:visitCode/check-out',
  selfCheckOutLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const result = await visitorPublicService.selfCheckOut(visitCode);
    res.json(createSuccessResponse(result, 'Checked out successfully'));
  }),
);

export { router as visitorPublicRoutes };
