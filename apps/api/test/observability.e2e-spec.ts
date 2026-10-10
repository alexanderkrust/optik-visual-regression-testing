import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';

describe('observability', () => {
  let t: TestApp;
  let admin: AdminClient;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
    delete process.env.METRICS_TOKEN;
    delete process.env.METRICS_ENABLED;
  });

  const value = (text: string, series: string) => {
    const line = text.split('\n').find((l) => l.startsWith(series + ' '));
    return line ? Number(line.split(' ').pop()) : undefined;
  };

  it('exposes Prometheus metrics', async () => {
    await admin.createProject('shop');
    const adapter = new AdapterClient(t.api, await admin.createToken('shop'));
    await adapter.fullRun({ Button: png(255) });
    const { runId } = await adapter.fullRun({ Button: png(0) });
    await admin.run(runId);

    const res = await call(`${t.api}/metrics`);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = res.body as string;
    expect(text).toContain('nodejs_heap_size_used_bytes');
    expect(value(text, 'optik_open_changes')).toBe(1);
    expect(value(text, 'optik_license_edition{edition="community"}')).toBe(1);
    expect(value(text, 'optik_snapshots_total{status="pending"}')).toBeGreaterThanOrEqual(1);
    expect(text).toMatch(/optik_diff_duration_seconds_count \d+/);
    // Routes by pattern, never by ID
    expect(text).toContain('route="/api/runs/:id"');
    expect(text).not.toContain(runId);
    // Health checks and scrapes are left out
    expect(text).not.toContain('route="/api/metrics"');
  });

  it('can require a token, or be switched off', async () => {
    process.env.METRICS_TOKEN = 's3cret';
    expect((await call(`${t.api}/metrics`)).status).toBe(401);
    expect((await call(`${t.api}/metrics`, { token: 's3cret' })).status).toBe(200);
    process.env.METRICS_ENABLED = 'false';
    expect((await call(`${t.api}/metrics`, { token: 's3cret' })).status).toBe(404);
  });

  it('gives every request an ID, keeping a sensible one from the client', async () => {
    const generated = await call(`${t.api}/health`);
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const given = await call(`${t.api}/health`, { headers: { 'X-Request-Id': 'lb-1234' } });
    expect(given.headers.get('x-request-id')).toBe('lb-1234');
    const nonsense = await call(`${t.api}/health`, { headers: { 'X-Request-Id': 'a b <c>' } });
    expect(nonsense.headers.get('x-request-id')).not.toBe('a b <c>');
  });
});
