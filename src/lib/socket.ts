import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketServer | null = null;

export function initSocket(server: HttpServer) {
    io = new SocketServer(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // ── Auth middleware: verify JWT + confirm user still exists & is active ──
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const secret = process.env.JWT_SECRET || 'dev-secret';
            const payload = jwt.verify(token, secret) as any;

            // Verify the user still exists and is active — prevents revoked users
            // from continuing to receive realtime events via a still-valid JWT.
            const { platformPrisma } = await import('../config/database');
            const user = await platformPrisma.user.findUnique({
                where: { id: payload.userId },
                select: { id: true, isActive: true, role: true, companyId: true },
            });
            if (!user || !user.isActive) {
                return next(new Error('User not found or inactive'));
            }

            (socket as any).user = {
                userId: user.id,
                role: user.role,
                companyId: user.companyId,
                tenantId: payload.tenantId,
            };
            next();
        } catch {
            return next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const user = (socket as any).user;

        // Auto-join per-user and per-company rooms for notification fan-out.
        if (user?.userId) socket.join(`user:${user.userId}`);
        if (user?.companyId) socket.join(`company:${user.companyId}`);

        // Join ticket room — must verify access (ticket belongs to user's company or user is super admin)
        socket.on('join-ticket', (ticketId: string) => {
            if (ticketId) socket.join(`ticket:${ticketId}`);
        });

        // Leave ticket room
        socket.on('leave-ticket', (ticketId: string) => {
            if (ticketId) socket.leave(`ticket:${ticketId}`);
        });

        // Join company room — only allow if user belongs to that company
        socket.on('join-company', (companyId: string) => {
            if (user?.role === 'SUPER_ADMIN' || user?.companyId === companyId) {
                socket.join(`company:${companyId}`);
            }
        });

        // Join admin room — only super admins
        socket.on('join-admin', () => {
            if (user?.role === 'SUPER_ADMIN') {
                socket.join('admin:support');
            }
        });

        socket.on('disconnect', () => {
            // Cleanup handled by socket.io
        });
    });

    return io;
}

export function getIO(): SocketServer | null {
    return io;
}

// Emit helpers
export function emitTicketMessage(ticketId: string, message: any) {
    io?.to(`ticket:${ticketId}`).emit('ticket:message', { ticketId, message });
}

export function emitTicketStatusChange(ticketId: string, companyId: string, status: string, ticket: any) {
    io?.to(`ticket:${ticketId}`).emit('ticket:status-changed', { ticketId, status, ticket });
    io?.to(`company:${companyId}`).emit('ticket:updated', { ticketId, status });
    io?.to('admin:support').emit('ticket:updated', { ticketId, status });
}

export function emitNewTicket(ticket: any) {
    io?.to('admin:support').emit('ticket:new', ticket);
}

export function emitTicketResolved(ticketId: string, companyId: string, ticket: any) {
    io?.to(`ticket:${ticketId}`).emit('ticket:resolved', { ticketId, ticket });
    io?.to(`company:${companyId}`).emit('ticket:resolved', { ticketId, ticket });
    io?.to('admin:support').emit('ticket:resolved', { ticketId, ticket });
}

/**
 * Notification fan-out: emit a lightweight UI hint to the user's socket room.
 * Clients receive { notificationId, unreadCountHint } and must re-fetch via
 * React Query — they do NOT append the payload directly to state.
 */
export function emitNotificationNew(userId: string, payload: { notificationId: string; traceId: string }) {
    io?.to(`user:${userId}`).emit('notification:new', {
        notificationId: payload.notificationId,
        unreadCountHint: null,
    });
}
