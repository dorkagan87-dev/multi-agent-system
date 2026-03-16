import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { createServer } from 'http';
import { config } from './config';
import { redis, redisSub } from './config/redis';
import { prisma } from './config/database';
import { logger } from './utils/logger';
import { createSocketServer } from './modules/events/events.gateway';
import { agentRoutes } from './modules/agents/agents.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { toolRoutes } from './modules/tools/tools.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { companyRoutes } from './modules/company/company.routes';
import { sectorRoutes } from './modules/company/sector.routes';
import { interventionRoutes } from './modules/company/intervention.routes';
import { networkRoutes } from './modules/network/network.routes';
import { optimizationRoutes } from './modules/optimization/optimization.routes';
import { templateRoutes } from './modules/templates/templates.routes';
import { finopsRoutes } from './modules/finops/finops.routes';
import { authenticate } from './middleware/authenticate';

async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    redis,
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(agentRoutes, { prefix: '/api/v1/agents' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(toolRoutes, { prefix: '/api/v1/tools' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(companyRoutes, { prefix: '/api/v1/company' });
  await app.register(sectorRoutes, { prefix: '/api/v1/sector' });
  await app.register(interventionRoutes, { prefix: '/api/v1/intervene' });
  await app.register(networkRoutes, { prefix: '/api/v1/network' });
  await app.register(optimizationRoutes, { prefix: '/api/v1/optimize' });
  await app.register(templateRoutes, { prefix: '/api/v1/templates' });
  await app.register(finopsRoutes, { prefix: '/api/v1/finops' });

  // Execution detail (metadata + task + agent info)
  app.get('/api/v1/executions/:execId', { preHandler: [authenticate] }, async (req: any) => {
    const { execId } = req.params as { execId: string };
    const exec = await prisma.taskExecution.findUnique({
      where: { id: execId },
      include: {
        task: { select: { id: true, title: true, description: true, projectId: true, status: true } },
        agent: { select: { id: true, name: true, provider: true, modelId: true, avatarUrl: true } },
      },
    });
    if (!exec) return req.server.httpErrors?.notFound?.() ?? { error: 'Not found' };
    return exec;
  });

  // Standalone execution logs endpoint (used by project detail + agent detail pages)
  app.get('/api/v1/executions/:execId/logs', { preHandler: [authenticate] }, async (req: any) => {
    const { execId } = (req.params as { execId: string });
    return prisma.executionLog.findMany({
      where: { executionId: execId },
      orderBy: { timestamp: 'asc' },
    });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  return app;
}

async function main() {
  const app = await buildApp();

  // Wrap Fastify server in raw HTTP server for Socket.io
  const httpSrv = createServer((req, res) => {
    app.server.emit('request', req, res);
  });

  createSocketServer(httpSrv, config.CORS_ORIGIN);

  await app.listen({ port: config.PORT, host: config.HOST });
  httpSrv.listen(config.PORT + 1, () => {
    logger.info(`🔌 Socket.io server listening on port ${config.PORT + 1}`);
  });

  logger.info(`🚀 API server running at http://${config.HOST}:${config.PORT}`);
}

main().catch((err) => {
  logger.error(err, 'Fatal error during startup');
  process.exit(1);
});
