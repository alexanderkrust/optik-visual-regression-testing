import { createHmac } from 'crypto';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { FakeSmtp, FakeWebhooks } from './fake-receivers';

const WHITE = png(255);
const BLACK = png(0);

describe('notifications', () => {
  let t: TestApp;
  let hooks: FakeWebhooks;
  let smtp: FakeSmtp;
  let admin: AdminClient;
  let adapter: AdapterClient;

  beforeAll(async () => {
    hooks = new FakeWebhooks();
    smtp = new FakeSmtp();
    await Promise.all([hooks.start(), smtp.start()]);
    process.env.SMTP_URL = smtp.url;
    process.env.PUBLIC_URL = 'https://optik.example.com';
    t = await startApp();
  });
  afterAll(async () => {
    // Test files share one process: don't leak the settings into other files
    delete process.env.SMTP_URL;
    delete process.env.PUBLIC_URL;
    await t.app.close();
    await Promise.all([hooks.stop(), smtp.stop()]);
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    hooks.requests.length = 0;
    hooks.status = 200;
    smtp.messages.length = 0;
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const addChannel = (json: object, token = admin.jwt) =>
    call(`${t.api}/projects/shop/notifications`, { token, json });

  /** A first run (baseline) and a second one with `count` changes */
  async function runWithChanges(count: number) {
    const names = ['A', 'B', 'C'].slice(0, Math.max(count, 1));
    await adapter.fullRun(Object.fromEntries(names.map((n) => [n, WHITE])));
    return adapter.fullRun(Object.fromEntries(names.map((n, i) => [n, i < count ? BLACK : WHITE])));
  }

  describe('channels', () => {
    it('stores targets encrypted and shows only a hint of webhook URLs', async () => {
      const res = await addChannel({ type: 'slack', target: `${hooks.url}/services/T0/B0/secretXYZ` });
      expect(res.status).toBe(201);
      expect(res.body.label).toMatch(/…tXYZ$/);
      expect(JSON.stringify(res.body)).not.toContain('secretXYZ');
      expect(res.body.events).toEqual(['run.needs_review', 'run.reviewed']);

      const [row] = await t.prisma.notificationChannel.findMany();
      expect(row.targetEncrypted).not.toContain('secret');
      expect((await call(`${t.api}/projects/shop/notifications`, { token: admin.jwt })).body).toHaveLength(1);
    });

    it('validates channels', async () => {
      expect((await addChannel({ type: 'pager', target: hooks.url })).status).toBe(400);
      expect((await addChannel({ type: 'slack', target: 'not a url' })).status).toBe(400);
      expect((await addChannel({ type: 'webhook', target: 'ftp://x' })).status).toBe(400);
      expect((await addChannel({ type: 'email', target: 'a@b.c, nope' })).status).toBe(400);
      expect((await addChannel({ type: 'slack', target: hooks.url, events: ['run.deleted'] })).status).toBe(400);
    });

    it('is for maintainers only', async () => {
      const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      expect((await addChannel({ type: 'slack', target: hooks.url }, reviewer.jwt)).status).toBe(403);
    });

    it('sends test messages and reports failures', async () => {
      const { body } = await addChannel({ type: 'slack', target: `${hooks.url}/test` });
      const test = () => call(`${t.api}/projects/shop/notifications/${body.id}/test`, { method: 'POST', token: admin.jwt });
      expect((await test()).body).toEqual({ delivered: true });
      expect(hooks.to('/test')[0].body.text).toContain('test notification');

      hooks.status = 500;
      expect((await test()).body).toEqual({ delivered: false });
    });
  });

  describe('when a run has changes to review', () => {
    it('notifies Slack, Teams and signed webhooks with a link to the review', async () => {
      await addChannel({ type: 'slack', target: `${hooks.url}/slack` });
      await addChannel({ type: 'teams', target: `${hooks.url}/teams` });
      const webhook = (await addChannel({ type: 'webhook', target: `${hooks.url}/hook` })).body;
      expect(webhook.webhookSecret).toMatch(/^[0-9a-f]{64}$/);

      const run = await runWithChanges(2);
      const reviewUrl = `https://optik.example.com/shop/${run.runId}`;

      expect(hooks.to('/slack')[0].body.text).toContain('2 visual changes to review');
      expect(hooks.to('/slack')[0].body.text).toContain(reviewUrl);

      const card = hooks.to('/teams')[0].body.attachments[0];
      expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
      expect(card.content.actions[0].url).toBe(reviewUrl);

      const [hook] = hooks.to('/hook');
      expect(hook.headers['x-optik-event']).toBe('run.needs_review');
      const expected = createHmac('sha256', webhook.webhookSecret).update(hook.raw).digest('hex');
      expect(hook.headers['x-optik-signature']).toBe(`sha256=${expected}`);
      expect(hook.body).toMatchObject({
        event: 'run.needs_review',
        project: { slug: 'shop' },
        run: { id: run.runId, pendingCount: 2, changedCount: 2 },
        reviewUrl,
      });
    });

    it('sends nothing for runs without changes', async () => {
      await addChannel({ type: 'slack', target: `${hooks.url}/slack` });
      await adapter.fullRun({ A: WHITE });
      await adapter.fullRun({ A: WHITE });
      expect(hooks.requests).toHaveLength(0);
    });

    it('only notifies channels subscribed to the event', async () => {
      await addChannel({ type: 'slack', target: `${hooks.url}/done-only`, events: ['run.reviewed'] });
      await runWithChanges(1);
      expect(hooks.requests).toHaveLength(0);
    });

    it('never fails a run because a receiver fails', async () => {
      await addChannel({ type: 'slack', target: `${hooks.url}/slack` });
      hooks.status = 500;
      const run = await runWithChanges(1);
      expect(run.completed.status).toBe('complete');
      expect(hooks.requests).toHaveLength(1);
    });
  });

  it('notifies once all changes of a run are reviewed', async () => {
    await addChannel({ type: 'slack', target: `${hooks.url}/slack`, events: ['run.reviewed'] });
    const run = await runWithChanges(2);

    await admin.review(run.snapshots.A.id, 'approved');
    expect(hooks.requests).toHaveLength(0);
    await admin.review(run.snapshots.B.id, 'rejected');
    expect(hooks.to('/slack').map((r) => r.body.text)).toEqual([
      expect.stringContaining('Review done — 1 change rejected'),
    ]);

    // Changing a decision afterwards doesn't notify again
    await admin.review(run.snapshots.B.id, 'approved');
    expect(hooks.requests).toHaveLength(1);
  });

  describe('e-mail', () => {
    it('sends notifications to e-mail channels', async () => {
      await addChannel({ type: 'email', target: 'team@example.com, lead@example.com' });
      const run = await runWithChanges(1);
      expect(smtp.messages).toHaveLength(1);
      expect(smtp.messages[0].to).toEqual(['team@example.com', 'lead@example.com']);
      expect(smtp.messages[0].raw).toContain('Subject: [optik] 1 visual change to review');
      expect(smtp.messages[0].raw).toContain(`https://optik.example.com/shop/${run.runId}`);
    });

    it('sends invitations by e-mail', async () => {
      const res = await call(`${t.api}/invitations`, { token: admin.jwt, json: { email: 'new@example.com' } });
      expect(res.body.emailSent).toBe(true);
      expect(smtp.messages[0].to).toEqual(['new@example.com']);
      expect(smtp.messages[0].raw).toContain(`https://optik.example.com${res.body.invitePath}`);
    });
  });
});
