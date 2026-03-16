import { Server as SocketIOServer } from 'socket.io';
import { redisSub } from '../../config/redis';
import { CHANNEL } from './events.service';
import { verifyAccessToken } from '../auth/auth.service';
import { logger } from '../../utils/logger';
import type { Server as HttpServer } from 'http';

export function createSocketServer(httpServer: HttpServer, corsOrigin: string): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: '/socket.io',
  });

  // Auth middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      (socket as any).userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: (socket as any).userId }, 'Socket connected');

    socket.on('subscribe:project', ({ projectId }: { projectId: string }) => {
      socket.join(`project:${projectId}`);
    });
    socket.on('unsubscribe:project', ({ projectId }: { projectId: string }) => {
      socket.leave(`project:${projectId}`);
    });
    socket.on('subscribe:agent', ({ agentId }: { agentId: string }) => {
      socket.join(`agent:${agentId}`);
    });
    socket.on('subscribe:global', () => {
      socket.join('global');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  // Subscribe to Redis and fan out to sockets
  redisSub.subscribe(CHANNEL, (err) => {
    if (err) logger.error({ err }, 'Redis subscribe error');
    else logger.info(`Subscribed to Redis channel: ${CHANNEL}`);
  });

  redisSub.on('message', (_channel, message) => {
    try {
      const { type, payload } = JSON.parse(message);

      // Emit to specific rooms when available to avoid duplicate delivery
      // for clients subscribed to both a specific room and 'global'.
      // Fall back to 'global' only for events with no specific target.
      const hasSpecificRoom = payload?.projectId || payload?.agentId;

      if (!hasSpecificRoom) {
        io.to('global').emit(type, payload);
      } else {
        if (payload?.projectId) {
          io.to(`project:${payload.projectId}`).emit(type, payload);
        }
        if (payload?.agentId) {
          io.to(`agent:${payload.agentId}`).emit(type, payload);
        }
        // Also deliver to global subscribers who don't join specific rooms
        io.to('global').emit(type, payload);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse Redis message');
    }
  });

  return io;
}
