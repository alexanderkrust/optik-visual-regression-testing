import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

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

  // The API lives under /api; everything else is the web UI (same origin, no CORS)
  app.setGlobalPrefix('api');
}
