# Security settings

How optik protects itself against misuse by people who can change settings or upload screenshots, and what you can tune. Reporting vulnerabilities: [SECURITY.md](../SECURITY.md).

## Outbound requests

optik makes HTTP requests to URLs that people configure:

| Request | Configured by | Where |
|---|---|---|
| Notification webhooks (Slack, Teams, generic) | project maintainers | *Project → Settings → Notifications* |
| CI provider API (commit statuses) | project maintainers | *Project → Settings → Commit status* |
| OIDC discovery, token, userinfo and JWKS | admins | *Single sign-on* |

Without limits, someone with one of these roles could point a URL at the server optik runs on, at the cloud metadata service (`169.254.169.254`, which hands out cloud credentials) or at internal services, and use optik to reach them (server-side request forgery). So optik checks the address it connects to:

| Addresses | |
|---|---|
| Loopback (`127.0.0.0/8`, `::1`) | always refused |
| Link-local (`169.254.0.0/16`, `fe80::/10`) — includes the metadata services of AWS, Google Cloud, Azure, OpenStack and DigitalOcean | always refused |
| Other cloud metadata addresses (`fd00:ec2::254`, `100.100.100.200`, `192.0.0.192`) | always refused |
| Unspecified (`0.0.0.0/8`, `::`), multicast, reserved (`240.0.0.0/4`) | always refused |
| Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `fc00::/7`) | allowed, unless `OUTBOUND_ALLOW_PRIVATE=false` |
| Everything else | allowed |

IPv4 addresses written as IPv6 (`::ffff:127.0.0.1`, NAT64 `64:ff9b::/96`) count as the IPv4 address.

**`OUTBOUND_ALLOWED_HOSTS`** makes exceptions to all of the above, comma-separated:

- host names: `gitlab.internal`, or `*.corp.example` for every host below `corp.example` — the host may then resolve to any address;
- addresses and CIDR ranges: `10.20.0.0/16`, `127.0.0.1`, `fd12:3456::/48`.

### When it is checked

- **When connecting**, against every address the host name resolves to — not only when the URL is saved. A host that resolves to a public address at first and to `127.0.0.1` later (DNS rebinding) is refused. Connections aren't reused, so every request is checked anew.
- **For every redirect.**
- **When saving**, for URLs that contain a refused address or `localhost`, so mistakes show right away (*"optik does not connect to 169.254.169.254: it is a link-local address"*).

Responses aren't passed on: *Send test* only says whether a notification was delivered, logs and *Check connection* name the HTTP status or network error, never the body a server answered. The one exception is the OAuth error message of an identity provider's token endpoint, shown when a sign-in fails.

### Choosing the default

Self-hosted installations usually talk to a GitLab, Bitbucket Data Center or identity provider on the internal network, so private addresses are **allowed by default** — refusing them would break those installations on upgrade. The trade-off: a project maintainer can make optik send requests to internal services. They can't read the answers, but they can learn whether a host and port answer.

If maintainers aren't trusted with that, or optik runs next to sensitive internal services, set:

```
OUTBOUND_ALLOW_PRIVATE=false
OUTBOUND_ALLOWED_HOSTS=gitlab.internal,sso.corp.example
```

A network policy that limits optik's egress (Kubernetes `NetworkPolicy`, security groups) is a good addition either way.

Not covered, because only whoever runs optik configures them through environment variables: S3 storage, SMTP, the OpenTelemetry collector. SAML entry points are only redirects of the user's browser — optik never requests them itself. Outbound requests don't use `HTTP_PROXY` / `HTTPS_PROXY`.

## Screenshot size

Uploads are limited to 50 MB, but a PNG compresses well: a few hundred bytes can describe an image of 100,000 × 100,000 pixels, which takes 40 GB once decoded. optik reads the dimensions from the PNG header before decoding and refuses screenshots above **`MAX_IMAGE_PIXELS`** (default 50 million) with a 400:

> Snapshot "Checkout": The image is 100000×100000 pixels (10000 megapixels); at most 50 megapixels are allowed (MAX_IMAGE_PIXELS)

The limit also applies to the comparison with the baseline, which covers the larger width and the larger height of both images.

The default fits full-page screenshots: Chromium typically captures at most 16,384 pixels in each direction, so a page 1,280 CSS pixels wide at device scale factor 2 is at most 2,560 × 16,384 = 42 megapixels. Each decoded image takes 4 bytes per pixel and a comparison holds about four of them — up to 800 MB per diff worker at the limit, times `DIFF_WORKERS`. Lower the limit when memory is tight; raise it only for wider screenshots and with memory to match.
