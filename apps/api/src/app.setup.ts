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

  // The API lives under /api; everything else is the web UI (same origin, no CORS)
  app.setGlobalPrefix('api');
}
