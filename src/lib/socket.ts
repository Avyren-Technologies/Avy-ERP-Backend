import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketServer | null = null;

export function initSocket(server: HttpServer) {
    io = new SocketServer(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        // Join ticket room
        socket.on('join-ticket', (ticketId: string) => {
            socket.join(`ticket:${ticketId}`);
        });

        // Leave ticket room
        socket.on('leave-ticket', (ticketId: string) => {
            socket.leave(`ticket:${ticketId}`);
        });

        // Join company room (for company-admin to get notified of new messages on any of their tickets)
        socket.on('join-company', (companyId: string) => {
            socket.join(`company:${companyId}`);
        });

        // Join admin room (for super-admin to get notified of all ticket updates)
        socket.on('join-admin', () => {
            socket.join('admin:support');
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
