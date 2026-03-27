import { Router } from 'express';
import { supportController as controller } from './support.controller';

// ── Company Admin Routes (mounted at /company/support) ─────────────

const supportCompanyRoutes = Router();

supportCompanyRoutes.post('/tickets', controller.createTicket);
supportCompanyRoutes.get('/tickets', controller.listMyTickets);
supportCompanyRoutes.get('/tickets/:id', controller.getMyTicket);
supportCompanyRoutes.post('/tickets/:id/messages', controller.sendMyMessage);
supportCompanyRoutes.patch('/tickets/:id/close', controller.closeMyTicket);

// ── Super Admin / Platform Routes (mounted at /platform/support) ───

const supportPlatformRoutes = Router();

supportPlatformRoutes.get('/tickets', controller.listAllTickets);
supportPlatformRoutes.get('/tickets/:id', controller.getTicketAdmin);
supportPlatformRoutes.post('/tickets/:id/messages', controller.replyToTicket);
supportPlatformRoutes.patch('/tickets/:id/status', controller.updateTicketStatus);
supportPlatformRoutes.post('/tickets/:id/approve-module', controller.approveModuleChange);
supportPlatformRoutes.post('/tickets/:id/reject-module', controller.rejectModuleChange);
supportPlatformRoutes.get('/stats', controller.getTicketStats);

export { supportCompanyRoutes, supportPlatformRoutes };
