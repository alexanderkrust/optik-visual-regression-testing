import 'reflect-metadata';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ensureSecrets, loadFileSecrets } from './bootstrap/env';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Before Nest starts: secrets from *_FILE variables, generated secrets from the database
  loadFileSecrets();
  await ensureSecrets();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: honour X-Forwarded-* from a reverse proxy in front of optik
    new FastifyAdapter({ trustProxy: true }),
  );

  await configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('Optik API')
    .setDescription('Visual regression testing API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await mountWebUi(app);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`optik running on http://localhost:${port}`);
}

/**
 * Serves the SvelteKit web UI (adapter-node build) from the same process and
 * port: every request outside /api is handed to its request handler.
 * Skipped in development, where the UI runs on the Vite dev server.
 */
async function mountWebUi(app: NestFastifyApplication) {
  const buildDir = resolve(
    process.env.OPTIK_WEB_DIR ?? join(__dirname, '../../web/build'),
  );
  const handlerFile = join(buildDir, 'handler.js');
  if (!existsSync(handlerFile)) {
    logger.log(`No web UI build at ${buildDir} — serving the API only`);
    return;
  }

  // Without ORIGIN, adapter-node derives the origin from these headers and
  // otherwise assumes https — which breaks form actions on plain http.
  process.env.PROTOCOL_HEADER ||= 'x-forwarded-proto';
  process.env.HOST_HEADER ||= 'x-forwarded-host';

  // The handler is an ES module; a plain import() would be compiled to require()
  const importEsm = new Function('path', 'return import(path)') as (
    path: string,
  ) => Promise<{ handler: WebHandler }>;
  const { handler } = await importEsm(handlerFile);

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request, reply, done) => {
    if (request.url === '/api' || request.url.startsWith('/api/')) return done();

    const headers = request.raw.headers;
    headers['x-forwarded-proto'] ??= request.protocol;
    headers['x-forwarded-host'] ??= headers.host;

    reply.hijack();
    handler(request.raw, reply.raw, () => {
      reply.raw.statusCode = 404;
      reply.raw.end('Not found');
    });
  });
  logger.log(`Serving web UI from ${buildDir}`);
}

type WebHandler = (
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  next: () => void,
) => void;

bootstrap();
