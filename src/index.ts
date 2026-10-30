import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { configureProxy } from './config/proxy';
import { createLogger } from './logger';
import { createRedisManager } from './redis';
import { checkDependencies } from './health';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

dotenv.config();

const app: Express = express();
configureProxy(app, process.env);
export const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Logger
export const logger = createLogger();
export const redis = createRedisManager(process.env.REDIS_URL, logger);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || '100'),
  message: 'Too many requests, please try again later.',
});
app.use('/api/', limiter);

// Request logging
app.use(requestLogger);

// Health check — responds immediately so the process is marked healthy as
// soon as the HTTP server is ready, regardless of database state.
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Deep health check — verifies database and configured Redis connectivity. Use for monitoring
// and alerting rather than the deployment healthcheck probe.
app.get('/health/deep', async (_req: Request, res: Response) => {
  const result = await checkDependencies(
    () => prisma.$queryRaw`SELECT 1`,
    () => redis.health()
  );
  if (result.statusCode !== 200) {
    logger.warn('Dependency health check failed', {
      database: result.body.database,
      redis: result.body.redis,
    });
  }
  res.status(result.statusCode).json(result.body);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Status endpoint
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  redis.stop();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
// Keep liveness independent of dependency availability; deep health reports failures.
void redis.start();
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

export default app;
