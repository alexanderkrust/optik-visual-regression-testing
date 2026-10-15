import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { blockedReason, describeOutboundError, guardedLookup, outboundFetch, outboundPolicy, outboundUrlProblem } from './outbound';

const policy = (env: Record<string, string> = {}) => outboundPolicy(env);

describe('outbound policy', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.OUTBOUND_ALLOW_PRIVATE = saved.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOWED_HOSTS = saved.OUTBOUND_ALLOWED_HOSTS;
    if (saved.OUTBOUND_ALLOW_PRIVATE === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
    if (saved.OUTBOUND_ALLOWED_HOSTS === undefined) delete process.env.OUTBOUND_ALLOWED_HOSTS;
  });

  it.each([
    ['127.0.0.1', 'a loopback address'],
    ['127.8.9.10', 'a loopback address'],
    ['::1', 'a loopback address'],
    ['169.254.169.254', 'a link-local address'],
    ['fe80::1', 'a link-local address'],
    ['fd00:ec2::254', 'a cloud metadata address'],
    ['100.100.100.200', 'a cloud metadata address'],
    ['0.0.0.0', 'an unspecified address'],
    ['::', 'an unspecified address'],
    ['224.0.0.1', 'a multicast address'],
    ['ff02::1', 'a multicast address'],
    ['255.255.255.255', 'a reserved address'],
    // IPv4 in IPv6 clothing
    ['::ffff:169.254.169.254', 'a link-local address'],
    ['::ffff:7f00:1', 'a loopback address'],
    ['64:ff9b::a9fe:a9fe', 'a link-local address'],
    ['64:ff9b::127.0.0.1', 'a loopback address'],
  ])('always refuses %s', (address, reason) => {
    expect(blockedReason(address, policy())).toBe(reason);
    expect(blockedReason(address, policy({ OUTBOUND_ALLOW_PRIVATE: 'true' }))).toBe(reason);
  });

  it.each(['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', 'fd12::1', '::ffff:10.0.0.1'])(
    'allows the private address %s unless OUTBOUND_ALLOW_PRIVATE=false',
    (address) => {
      expect(blockedReason(address, policy())).toBeNull();
      expect(blockedReason(address, policy({ OUTBOUND_ALLOW_PRIVATE: 'false' }))).toBe('a private address');
    },
  );

  it.each(['140.82.112.6', '172.32.0.1', '2606:4700::1111', '8.8.8.8'])('allows the public address %s', (address) => {
    expect(blockedReason(address, policy({ OUTBOUND_ALLOW_PRIVATE: 'false' }))).toBeNull();
  });

  it('lets OUTBOUND_ALLOWED_HOSTS make exceptions with addresses and CIDR ranges', () => {
    const p = policy({ OUTBOUND_ALLOW_PRIVATE: 'false', OUTBOUND_ALLOWED_HOSTS: '10.20.0.0/16, 127.0.0.1 [::1]' });
    expect(blockedReason('10.20.3.4', p)).toBeNull();
    expect(blockedReason('10.21.3.4', p)).toBe('a private address');
    expect(blockedReason('127.0.0.1', p)).toBeNull();
    expect(blockedReason('127.0.0.2', p)).toBe('a loopback address');
    expect(blockedReason('::1', p)).toBeNull();
  });

  it('rejects invalid CIDR ranges', () => {
    expect(() => policy({ OUTBOUND_ALLOWED_HOSTS: '10.0.0.0/x' })).toThrow(/not a valid CIDR/);
  });

  it('judges URLs in settings without DNS', () => {
    delete process.env.OUTBOUND_ALLOWED_HOSTS;
    delete process.env.OUTBOUND_ALLOW_PRIVATE;
    expect(outboundUrlProblem(new URL('http://169.254.169.254/latest/meta-data'))).toMatch(
      /does not connect to 169\.254\.169\.254: it is a link-local address/,
    );
    expect(outboundUrlProblem(new URL('http://[::ffff:127.0.0.1]:8080/'))).toMatch(/loopback/);
    expect(outboundUrlProblem(new URL('http://localhost:3000/'))).toMatch(/loopback/);
    expect(outboundUrlProblem(new URL('https://gitlab.internal/api/v4'))).toBeNull();
    expect(outboundUrlProblem(new URL('http://10.0.0.5/'))).toBeNull();

    process.env.OUTBOUND_ALLOWED_HOSTS = 'localhost';
    expect(outboundUrlProblem(new URL('http://localhost:3000/'))).toBeNull();
  });

  describe('at connection time', () => {
    let server: Server;
    let port: number;
    let requests = 0;

    beforeAll(async () => {
      server = createServer((req, res) => {
        requests++;
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: `http://127.0.0.1:${port}/secret` }).end();
        } else {
          res.end('secret');
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise((resolve) => server.close(resolve)));
    beforeEach(() => {
      requests = 0;
      delete process.env.OUTBOUND_ALLOWED_HOSTS;
      delete process.env.OUTBOUND_ALLOW_PRIVATE;
    });

    it('refuses addresses in the URL', async () => {
      const err = await outboundFetch(`http://127.0.0.1:${port}/`).catch((e) => e);
      expect(describeOutboundError(err)).toMatch(/does not connect to 127\.0\.0\.1: it is a loopback address/);
      expect(requests).toBe(0);
    });

    it('refuses host names that resolve to a refused address', async () => {
      const err = await outboundFetch(`http://localhost:${port}/`).catch((e) => e);
      expect(describeOutboundError(err)).toMatch(/does not connect to localhost: it resolves to a loopback address/);
      expect(requests).toBe(0);
    });

    it('checks every redirect', async () => {
      process.env.OUTBOUND_ALLOWED_HOSTS = 'localhost';
      const err = await outboundFetch(`http://localhost:${port}/redirect`).catch((e) => e);
      expect(requests).toBe(1);
      expect(describeOutboundError(err)).toMatch(/does not connect to 127\.0\.0\.1/);
    });

    it('connects to allowed hosts', async () => {
      process.env.OUTBOUND_ALLOWED_HOSTS = '127.0.0.1';
      const res = await outboundFetch(`http://127.0.0.1:${port}/`);
      expect(await res.text()).toBe('secret');
    });

    it('answers lookups in both forms', async () => {
      process.env.OUTBOUND_ALLOWED_HOSTS = 'localhost';
      const one = await new Promise<unknown[]>((resolve, reject) =>
        guardedLookup('localhost', {}, (err, ...rest) => (err ? reject(err) : resolve(rest))),
      );
      expect(typeof one[0]).toBe('string');
      const all = await new Promise<unknown>((resolve, reject) =>
        guardedLookup('localhost', { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
      );
      expect(Array.isArray(all)).toBe(true);
    });

    it('describes other failures without what the server said', () => {
      expect(describeOutboundError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toBe(
        'the request failed (ECONNREFUSED)',
      );
    });
  });
});
