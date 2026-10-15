# Configuration

Only `DATABASE_URL` is required. Every variable also accepts a `<NAME>_FILE` variant that reads the value from a file (Docker / Kubernetes secrets).

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | HTTP port for web UI and API |
| `STORAGE_DIR` | `/data` (image), `./data` | Directory for screenshots when no S3 bucket is configured |
| `S3_BUCKET` | — | Store screenshots in this S3 bucket instead (created on startup if missing) |
| `S3_ENDPOINT` | — | S3 endpoint; leave empty for AWS S3 |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY_ID` | — | S3 access key (required with `S3_BUCKET`) |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret key (required with `S3_BUCKET`) |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style URLs; required by most self-hosted S3 servers |
| `JWT_SECRET` | generated | Secret for signing JWTs |
| `SESSION_SECRET` | generated | Secret for encrypting the session cookie |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `DIFF_WORKERS` | CPU cores, max. 4 | Worker threads for decoding and diffing screenshots; `0` runs them on the main thread |
| `MAX_IMAGE_PIXELS` | `50000000` | Largest screenshot — and comparison of a screenshot with its baseline — in pixels; larger uploads get a 400 before they are decoded. Decoded images take 4 bytes per pixel ([details](/security/settings#screenshot-size)) |
| `OUTBOUND_ALLOW_PRIVATE` | `true` | Let webhooks, CI APIs and identity providers be on private networks (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7). Loopback, link-local and cloud metadata addresses are always refused ([details](/security/settings#outbound-requests)) |
| `OUTBOUND_ALLOWED_HOSTS` | — | Exceptions to the outbound rules: host names (`gitlab.internal`, `*.corp.example`), addresses and CIDR ranges (`10.20.0.0/16`), comma-separated |
| `LOGIN_MAX_FAILURES` | `10` | Failed sign-ins per account before it is temporarily blocked |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Time window for failed sign-ins (and maximum block duration) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Create the admin account on start instead of the setup page (automated installs) |
| `PUBLIC_URL` | URL the adapters use | Public URL of optik for links in commit statuses, notifications and invitation e-mails |
| `SMTP_URL` | — | SMTP server for e-mail notifications and invitations, e.g. `smtps://user:pass@mail.example.com:465` or `smtp://mail.example.com:587` |
| `SMTP_FROM` | `optik <optik@localhost>` | Sender of e-mails |
| `OPTIK_LICENSE` | — | License key (instead of entering it under *License*); `OPTIK_LICENSE_FILE` reads it from a file |
| `LOG_FORMAT` | `text` (image), `json` (Helm chart) | `json`: one JSON object per line with request IDs, for log collectors |
| `LOG_REQUESTS` | on with `json` | Access log (`true` / `false`); health checks and scrapes are left out |
| `METRICS_ENABLED` | `true` | Prometheus metrics at `/api/metrics` |
| `METRICS_TOKEN` | — | Require this bearer token for `/api/metrics` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Send OpenTelemetry traces (OTLP/HTTP) there; the other `OTEL_*` variables apply (`OTEL_SERVICE_NAME`, headers, …) |
| `ORIGIN` | derived from request | Public URL, only needed if a reverse proxy doesn't send `X-Forwarded-Proto` / `X-Forwarded-Host` |
| `SECURITY_TXT_CONTACT` | — | Your security contact(s) for this installation, comma-separated (`security@example.com`, `https://…`): serves `/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) |
| `SECURITY_TXT_POLICY`, `SECURITY_TXT_ENCRYPTION`, `SECURITY_TXT_ACKNOWLEDGMENTS` | — | Optional security.txt fields (URLs) |
| `SECURITY_TXT_LANGUAGES` | `en` | Languages for reports, e.g. `de, en` |
