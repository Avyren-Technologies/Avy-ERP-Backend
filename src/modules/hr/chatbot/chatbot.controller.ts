import { Request, Response } from 'express';
import { chatbotService } from './chatbot.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { startConversationSchema, sendMessageSchema } from './chatbot.validators';

export class ChatbotController {
  // ── Start Conversation ─────────────────────────────────────────────

  startConversation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const parsed = startConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const conversation = await chatbotService.startConversation(companyId, employeeId, parsed.data.channel);
    res.status(201).json(createSuccessResponse(conversation, 'Conversation started'));
  });

  // ── Send Message ───────────────────────────────────────────────────

  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const conversationId = req.params.id;
    if (!conversationId) throw ApiError.badRequest('Conversation ID is required');

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await chatbotService.sendMessage(companyId, conversationId, employeeId, parsed.data.content);
    res.json(createSuccessResponse(result, 'Message sent'));
  });

  // ── Get Conversation History ───────────────────────────────────────

  getHistory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const conversationId = req.params.id;
    if (!conversationId) throw ApiError.badRequest('Conversation ID is required');

    const history = await chatbotService.getConversationHistory(companyId, conversationId, employeeId);
    res.json(createSuccessResponse(history, 'Conversation history retrieved'));
  });

  // ── List Conversations ─────────────────────────────────────────────

  listConversations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const conversations = await chatbotService.listConversations(companyId, employeeId);
    res.json(createSuccessResponse(conversations, 'Conversations retrieved'));
  });

  // ── Escalate to HR ─────────────────────────────────────────────────

  escalate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const conversationId = req.params.id;
    if (!conversationId) throw ApiError.badRequest('Conversation ID is required');

    const conversation = await chatbotService.escalateToHR(companyId, conversationId);
    res.json(createSuccessResponse(conversation, 'Conversation escalated to HR'));
  });

  // ── Close Conversation ─────────────────────────────────────────────

  closeConversation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const conversationId = req.params.id;
    if (!conversationId) throw ApiError.badRequest('Conversation ID is required');

    const conversation = await chatbotService.closeConversation(companyId, conversationId);
    res.json(createSuccessResponse(conversation, 'Conversation closed'));
  });
}

export const chatbotController = new ChatbotController();
