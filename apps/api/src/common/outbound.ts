import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'dns';
import { BlockList, isIP } from 'net';
import { Agent, buildConnector, fetch as undiciFetch, type RequestInit, type Response } from 'undici';

/**
 * Guard for the HTTP requests optik makes to URLs that people configure —
 * notification webhooks, CI provider APIs and identity providers — so they
 * can't be pointed at cloud metadata endpoints, the optik host itself or
 * (optionally) the internal network (SSRF).
 *
 * The check runs when a connection is opened, against the addresses the host
 * name resolved to, and for every redirect. A host that resolves to a public
 * address when the URL is saved and to 127.0.0.1 later (DNS rebinding) is
 * still refused.
 *
 * - Always refused: loopback, link-local (incl. 169.254.169.254 and the other
 *   cloud metadata addresses), unspecified, multicast and reserved addresses.
 * - Private networks (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7) are
 *   allowed unless OUTBOUND_ALLOW_PRIVATE=false: self-hosted GitLab, Bitbucket
 *   Data Center and identity providers often live there.
 * - OUTBOUND_ALLOWED_HOSTS lists exceptions to both: host names
 *   ("gitlab.internal", "*.corp.example"), addresses and CIDR ranges.
 */

type Range = [address: string, prefix: number];

const ALWAYS: Record<string, Range[]> = {
  'a loopback address': [['127.0.0.0', 8], ['::1', 128]],
  'a link-local address': [['169.254.0.0', 16], ['fe80::', 10]],
  // Metadata services outside 169.254.0.0/16: AWS (IPv6), Alibaba Cloud, Oracle Cloud
  'a cloud metadata address': [['fd00:ec2::254', 128], ['100.100.100.200', 32], ['192.0.0.192', 32]],
  'an unspecified address': [['0.0.0.0', 8], ['::', 128]],
  'a multicast address': [['224.0.0.0', 4], ['ff00::', 8]],
  'a reserved address': [['240.0.0.0', 4]],
};
const PRIVATE: Range[] = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10], // carrier-grade NAT, e.g. Tailscale
  ['fc00::', 7],
];

const blockList = (ranges: Range[]) => {
  const list = new BlockList();
  for (const [address, prefix] of ranges) list.addSubnet(address, prefix, isIP(address) === 6 ? 'ipv6' : 'ipv4');
  return list;
};
const always = Object.entries(ALWAYS).map(([reason, ranges]) => [reason, blockList(ranges)] as const);
const privateRanges = blockList(PRIVATE);

const family = (address: string) => (isIP(address) === 6 ? 'ipv6' : 'ipv4');
const NAT64 = /^64:ff9b::(?:([\d.]+)|([\da-f]{1,4}):([\da-f]{1,4}))$/i;

/** The IPv4 address a NAT64 address (64:ff9b::/96) leads to; IPv4-mapped ones BlockList handles itself. */
function nat64(address: string): string | null {
  const m = NAT64.exec(address);
  if (!m) return null;
  if (m[1]) return isIP(m[1]) === 4 ? m[1] : null;
  const n = (parseInt(m[2], 16) << 16) | parseInt(m[3], 16);
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');
}

export interface OutboundPolicy {
  allowPrivate: boolean;
  hosts: Set<string>;
  /** "*.corp.example" → ".corp.example" */
  suffixes: string[];
  addresses: BlockList;
}

let cached: { key: string; policy: OutboundPolicy } | null = null;

/** The policy from OUTBOUND_ALLOW_PRIVATE and OUTBOUND_ALLOWED_HOSTS (read on every use, cached). */
export function outboundPolicy(env: NodeJS.ProcessEnv = process.env): OutboundPolicy {
  const allowPrivate = (env.OUTBOUND_ALLOW_PRIVATE ?? '').trim().toLowerCase() !== 'false';
  const allowed = env.OUTBOUND_ALLOWED_HOSTS ?? '';
  const key = `${allowPrivate}|${allowed}`;
  if (cached?.key === key) return cached.policy;

  const policy: OutboundPolicy = { allowPrivate, hosts: new Set(), suffixes: [], addresses: new BlockList() };
  for (const raw of allowed.split(/[\s,]+/)) {
    const entry = normalizeHost(raw);
    if (!entry) continue;
    const [address, prefix] = entry.split('/');
    if (isIP(address)) {
      const bits = prefix === undefined ? (isIP(address) === 6 ? 128 : 32) : Number(prefix);
      if (!Number.isInteger(bits)) throw new Error(`OUTBOUND_ALLOWED_HOSTS: "${raw}" is not a valid CIDR range`);
      policy.addresses.addSubnet(address, bits, family(address));
    } else if (entry.startsWith('*.')) {
      policy.suffixes.push(entry.slice(1));
    } else {
      policy.hosts.add(entry);
    }
  }
  cached = { key, policy };
  return policy;
}

const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

function hostAllowed(hostname: string, policy: OutboundPolicy): boolean {
  const host = normalizeHost(hostname);
  return policy.hosts.has(host) || policy.suffixes.some((suffix) => host.endsWith(suffix));
}

/** Why optik doesn't connect to `address`, e.g. "a loopback address"; null if it may. */
export function blockedReason(address: string, policy: OutboundPolicy = outboundPolicy()): string | null {
  const embedded = nat64(address);
  if (embedded) return blockedReason(embedded, policy);
  if (policy.addresses.check(address, family(address))) return null;
  for (const [reason, list] of always) if (list.check(address, family(address))) return reason;
  if (!policy.allowPrivate && privateRanges.check(address, family(address))) return 'a private address';
  return null;
}

/** Refused by the outbound policy; `message` names the host but not the address it resolved to. */
export class OutboundBlockedError extends Error {
  readonly code = 'EOUTBOUNDBLOCKED';
  constructor(hostname: string, reason: string, resolved: boolean) {
    super(
      `optik does not connect to ${hostname}: ${resolved ? 'it resolves to' : 'it is'} ${reason} ` +
        `(see OUTBOUND_ALLOWED_HOSTS)`,
    );
    this.name = 'OutboundBlockedError';
  }
}

/** The error for connecting to `address` (which `hostname` resolved to), or null. */
function refusal(hostname: string, address: string, policy: OutboundPolicy): OutboundBlockedError | null {
  if (hostAllowed(hostname, policy)) return null;
  const reason = blockedReason(address, policy);
  return reason ? new OutboundBlockedError(normalizeHost(hostname), reason, normalizeHost(hostname) !== address) : null;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;

/** dns.lookup that fails for hosts resolving to an address the policy refuses — any of them. */
export function guardedLookup(hostname: string, options: LookupOptions | LookupCallback, callback?: LookupCallback) {
  const done = (typeof options === 'function' ? options : callback)!;
  const opts: LookupOptions = typeof options === 'function' ? {} : options;
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return done(err);
    try {
      const policy = outboundPolicy();
      for (const { address } of addresses) {
        const refused = refusal(hostname, address, policy);
        if (refused) return done(refused);
      }
    } catch (error) {
      return done(error as Error);
    }
    if (opts.all) return done(null, addresses);
    done(null, addresses[0].address, addresses[0].family);
  });
}

const connect = buildConnector({ lookup: guardedLookup } as buildConnector.BuildOptions);

/**
 * undici dispatcher that applies the policy to every connection, redirects
 * included. Connections aren't reused (these requests are rare), so every
 * request resolves the host and is checked anew.
 */
export const outboundDispatcher = new Agent({
  pipelining: 0,
  connect(options, callback) {
    // Addresses in the URL are connected to without a lookup
    const host = normalizeHost(options.hostname);
    if (isIP(host)) {
      let refused: Error | null;
      try {
        refused = refusal(host, host, outboundPolicy());
      } catch (error) {
        refused = error as Error;
      }
      if (refused) return callback(refused, null);
    }
    return connect(options, callback);
  },
});

/** fetch() for URLs that people configure. */
export function outboundFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  return undiciFetch(url, { ...init, dispatcher: outboundDispatcher });
}

/**
 * For settings: why `url` can't be used, judged without DNS (addresses and
 * "localhost"); null if it may — connections are checked again anyway.
 */
export function outboundUrlProblem(url: URL): string | null {
  const host = normalizeHost(url.hostname);
  const policy = outboundPolicy();
  if (hostAllowed(host, policy)) return null;
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return new OutboundBlockedError(host, 'a loopback address', true).message;
  }
  return isIP(host) ? (refusal(host, host, policy)?.message ?? null) : null;
}

/**
 * A failed request in words, for logs and API responses: the policy's
 * refusal, or the network error code — never what the server answered.
 */
export function describeOutboundError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause;
  if (err instanceof OutboundBlockedError) return err.message;
  if (cause instanceof OutboundBlockedError) return cause.message;
  if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') return 'the request timed out';
  const code = (cause as { code?: string })?.code;
  return code ? `the request failed (${code})` : `the request failed`;
}
