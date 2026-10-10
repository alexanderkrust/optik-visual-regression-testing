import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MetricsService } from './observability/metrics.service';

/** Request IDs from a proxy or client are taken over if they look like one. */
const REQUEST_ID = /^[\w.:-]{1,128}$/;
/** Not worth a log line or a metric */
const QUIET = /^\/api\/(health|ready|metrics)\b/;

/** Configuration shared by the production server and the integration tests. */
export async function configureApp(app: NestFastifyApplication) {
  // Type cast needed: @fastify/multipart augments FastifyInstance with WebDAV methods
  // that NestJS's type wrapper doesn't declare, causing a structural mismatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(multipart as any, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Security headers for API responses. No CSP here: the API serves JSON and
  // the Swagger UI (inline scripts); the web UI sets its own CSP (svelte.config.js).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, { contentSecurityPolicy: false });

  // SCIM clients (identity providers) send application/scim+json
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'application/scim+json',
      { parseAs: 'string', bodyLimit: 1024 * 1024 },
      (_req: unknown, body: string, done: (err: Error | null, value?: unknown) => void) => {
        try {
          done(null, body ? JSON.parse(body) : {});
        } catch (err) {
          (err as Error & { statusCode?: number }).statusCode = 400;
          done(err as Error);
        }
      },
    );

  // Request IDs (X-Request-Id) for logs and traces, request metrics, access log
  const metrics = app.get(MetricsService);
  const httpLog = new Logger('HTTP');
  const accessLog = process.env.LOG_REQUESTS === 'true' || (process.env.LOG_FORMAT === 'json' && process.env.LOG_REQUESTS !== 'false');
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (req: any, reply: any, done: () => void) => {
    const given = req.headers['x-request-id'];
    req.requestId = typeof given === 'string' && REQUEST_ID.test(given) ? given : randomUUID();
    reply.header('X-Request-Id', req.requestId);
    done();
  });
  fastify.addHook('onResponse', (req: any, reply: any, done: () => void) => {
    const path = String(req.url).split('?')[0];
    if (path.startsWith('/api/') && !QUIET.test(path)) {
      const route = req.routeOptions?.url ?? 'unmatched';
      metrics.http.observe({ method: req.method, route, status: String(reply.statusCode) }, reply.elapsedTime / 1000);
      if (accessLog) {
        const line = `${req.method} ${path} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`;
        if (process.env.LOG_FORMAT !== 'json') httpLog.log(line);
        else httpLog.log({
          message: line,
          method: req.method,
          path,
          route,
          status: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
          ip: req.ip,
          requestId: req.requestId,
        });
      }
    }
    done();
  });

  // The API lives under /api; everything else is the web UI (same origin, no CORS)
  app.setGlobalPrefix('api');
}
