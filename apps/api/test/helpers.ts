import { Test, TestingModuleBuilder } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { PNG } from 'pngjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';

export interface TestApp {
  app: NestFastifyApplication;
  /** Base URL of the running API, e.g. http://127.0.0.1:54321/api */
  api: string;
  prisma: PrismaService;
}

/** Starts the real application (same setup as production) on a random port. */
export async function startApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<TestApp> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
  // Same as main.ts: X-Forwarded-* from a reverse proxy are honoured
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ trustProxy: true }));
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return {
    app,
    api: `http://127.0.0.1:${address.port}/api`,
    prisma: app.get(PrismaService),
  };
}

/** Removes all data — called before each test. */
export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE snapshots, runs, api_tokens, projects, refresh_tokens, users, instance_settings, audit_events, identity_providers, sso_login_codes CASCADE',
  );
}

/** A solid-color PNG. */
export function png(gray: number, width = 10, height = 10): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = gray;
    image.data[i + 1] = gray;
    image.data[i + 2] = gray;
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export async function call<T = any>(
  url: string,
  init: { method?: string; token?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
    headers,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
  });
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('application/json')
    ? await res.json()
    : type.startsWith('image/')
      ? Buffer.from(await res.arrayBuffer())
      : await res.text();
  return { status: res.status, body: body as T, headers: res.headers };
}

/** Admin-side helpers, authenticated with a JWT. */
export class AdminClient {
  constructor(
    private readonly api: string,
    readonly jwt: string,
  ) {}

  /** Creates the first user via the setup endpoint and signs in. */
  static async setup(api: string, email = 'admin@optik.test', password = 'correct-horse') {
    const res = await call(`${api}/auth/register`, { json: { email, password } });
    if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
    return new AdminClient(api, res.body.accessToken);
  }

  async createProject(slug: string) {
    const res = await call(`${this.api}/projects`, { token: this.jwt, json: { name: slug, slug } });
    if (res.status !== 201) throw new Error(`create project failed: ${res.status}`);
    return res.body;
  }

  async createToken(slug: string, expiresAt?: string): Promise<string> {
    const res = await call(`${this.api}/projects/${slug}/tokens`, {
      token: this.jwt,
      json: { name: 'ci', expiresAt },
    });
    if (res.status !== 201) throw new Error(`create token failed: ${res.status}`);
    return res.body.token;
  }

  review(snapshotId: string, status: 'approved' | 'rejected') {
    return call(`${this.api}/snapshots/${snapshotId}/status`, {
      method: 'PATCH',
      token: this.jwt,
      json: { status },
    });
  }

  run(id: string) {
    return call(`${this.api}/runs/${id}`, { token: this.jwt });
  }

  /** Invites `email` and accepts the invitation; returns the new user's client. */
  async inviteUser(
    email: string,
    opts: { role?: 'admin' | 'member'; projectSlug?: string; projectRole?: string } = {},
  ): Promise<AdminClient> {
    const invite = await call(`${this.api}/invitations`, { token: this.jwt, json: { email, ...opts } });
    if (invite.status !== 201) throw new Error(`invite failed: ${invite.status}`);
    const token = invite.body.invitePath.split('/').pop();
    const accepted = await call(`${this.api}/invitations/token/${token}/accept`, {
      json: { password: 'correct-horse' },
    });
    if (accepted.status !== 201) throw new Error(`accept failed: ${accepted.status}`);
    return new AdminClient(this.api, accepted.body.accessToken);
  }

  runs(slug: string) {
    return call(`${this.api}/runs?project=${slug}`, { token: this.jwt });
  }
}

/** What an adapter does, authenticated with a project token. */
export class AdapterClient {
  constructor(
    private readonly api: string,
    private readonly token: string,
  ) {}

  startRun(branch = 'main', commitSha = 'abc1234', suite?: string, ancestors?: string[]) {
    return call(`${this.api}/runs`, {
      token: this.token,
      json: { branch, commitSha, suite, ancestors },
    });
  }

  submit(runId: string, name: string, image: Buffer) {
    const form = new FormData();
    form.append('runId', runId);
    form.append('name', name);
    form.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), `${name}.png`);
    return call(`${this.api}/snapshots`, { token: this.token, form });
  }

  complete(runId: string) {
    return call(`${this.api}/runs/${runId}/complete`, { token: this.token, method: 'POST' });
  }

  /** A whole run: start, submit the given snapshots, complete. */
  async fullRun(
    snapshots: Record<string, Buffer>,
    branch = 'main',
    commitSha = 'abc1234',
    suite?: string,
  ) {
    const run = (await this.startRun(branch, commitSha, suite)).body;
    const results: Record<string, any> = {};
    for (const [name, image] of Object.entries(snapshots)) {
      results[name] = (await this.submit(run.id, name, image)).body;
    }
    const completed = (await this.complete(run.id)).body;
    return { runId: run.id as string, snapshots: results, completed };
  }
}
