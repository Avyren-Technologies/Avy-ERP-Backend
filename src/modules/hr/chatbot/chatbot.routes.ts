import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { chatbotController as controller } from './chatbot.controller';

const router = Router();

// ── Chatbot Conversations ────────────────────────────────────────────
router.post('/chatbot/conversations', requirePermissions(['hr:read']), controller.startConversation);
router.get('/chatbot/conversations', requirePermissions(['hr:read']), controller.listConversations);

// ── Chatbot Messages & Actions ───────────────────────────────────────
router.post('/chatbot/conversations/:id/messages', requirePermissions(['hr:read']), controller.sendMessage);
router.get('/chatbot/conversations/:id/messages', requirePermissions(['hr:read']), controller.getHistory);
router.patch('/chatbot/conversations/:id/escalate', requirePermissions(['hr:read']), controller.escalate);
router.patch('/chatbot/conversations/:id/close', requirePermissions(['hr:read']), controller.closeConversation);

export { router as chatbotRoutes };
