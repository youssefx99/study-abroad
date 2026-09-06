import express from 'express';
import cors from 'cors';
import { ok, fail, AppError, getErrorMessage } from '@flow/shared';
import { ZodError } from 'zod';

export { createLogger } from './logger.js';
export { httpJson, httpStream } from './http.js';
import { createLogger } from './logger.js';

/**
 * Builds an Express app with the conventions every Flow service shares:
 * JSON body parsing, CORS, a health endpoint, request logging, and a single
 * error handler that turns any throw into the shared response envelope.
 *
 * @param {{ name: string, version?: string, jsonLimit?: string }} options
 */
export function createService({ name, version = '1.0.0', jsonLimit = '8mb' }) {
  const app = express();
  const logger = createLogger(name);

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: jsonLimit }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json(
      ok({
        service: name,
        version,
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      }),
    );
  });

  return { app, logger };
}

/**
 * Installs the 404 and error handlers. Call after every route is registered,
 * because Express matches middleware in order.
 * @param {import('express').Express} app
 * @param {ReturnType<typeof createLogger>} logger
 */
export function finaliseService(app, logger) {
  app.use((req, res) => {
    res.status(404).json(fail(`No route matches ${req.method} ${req.path}`));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      logger.warn(`Validation failed: ${issues.map((i) => `${i.field} ${i.message}`).join('; ')}`);
      res.status(422).json(fail('Some fields need attention before this can be saved.', { issues }));
      return;
    }

    if (error instanceof AppError) {
      if (error.status >= 500) logger.error(error.message, error);
      else logger.warn(error.message);
      res.status(error.status).json(fail(error.message, error.details));
      return;
    }

    logger.error('Unhandled error', error);
    res.status(500).json(fail(getErrorMessage(error)));
  });
}

/**
 * Starts the HTTP server and wires graceful shutdown, so `npm run dev` can
 * restart services without leaking ports.
 * @param {import('express').Express} app
 * @param {number | string} port
 * @param {ReturnType<typeof createLogger>} logger
 */
export function listen(app, port, logger) {
  const server = app.listen(Number(port), () => {
    logger.info(`listening on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Stop the other process or change the port in .env.`);
      process.exit(1);
    }
    logger.error('Server error', error);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

/**
 * Wraps an async route so a rejected promise reaches the error handler instead
 * of hanging the request.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} handler
 */
export function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
