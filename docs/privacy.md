# Privacy and data

optik runs entirely in your infrastructure. The vendor never receives, stores or processes your data — there is nothing to sign a data processing agreement for.

## No telemetry

optik does not send usage data, crash reports or "phone home" — not by default, not optionally. License keys are checked offline, also in air-gapped networks.

The only outgoing connections are the integrations an admin sets up:

| Connection | When | Configured under |
|---|---|---|
| S3 storage | storing and reading images | `S3_*` variables |
| CI system (GitHub, GitLab, Bitbucket, Azure DevOps) | reporting commit statuses | *Project → Settings → Commit status* |
| Slack, Microsoft Teams, webhooks, SMTP | notifications | *Project → Settings → Notifications*, `SMTP_URL` |
| Identity providers (OIDC discovery, token, userinfo, JWKS) | single sign-on | *Single sign-on* |
| OpenTelemetry collector | tracing | `OTEL_EXPORTER_OTLP_ENDPOINT` |

The web UI loads nothing from other sites: its Content Security Policy only allows optik's own address (`default-src 'self'`, `connect-src 'self'`).

## Personal data optik stores

| Data | Purpose | Where | How long |
|---|---|---|---|
| E-mail address, password hash, role | accounts | PostgreSQL | until the account is removed |
| Identity provider subject, last sign-in | single sign-on | PostgreSQL | until the account or provider is removed |
| Reviews (who accepted / rejected, when) | review history | PostgreSQL | with the snapshot; removing an account keeps the review without a name |
| Comments | review discussion | PostgreSQL | until deleted, or removed with old runs (retention) |
| Audit log: person, action, IP address, browser (user agent) | security, compliance (Enterprise) | PostgreSQL | not deleted by optik (append-only) |
| Server logs: IP address, request ID (with `LOG_FORMAT=json` / `LOG_REQUESTS`) | operations | stdout, your log system | as your log system keeps them |
| Screenshots | visual regression testing | S3 bucket or `STORAGE_DIR` | until removed with old runs (retention) |

Screenshots show your application as your tests render it. If tests run against real data, screenshots can contain it — use test data.

Removing an account removes its e-mail address, sign-ins and memberships. The audit log keeps the e-mail address of past events on purpose: it must show who did what, and it cannot be changed. If you need to remove it (e.g. for an erasure request you are obliged to fulfil), a database administrator can do so directly in `audit_events`; *Verify integrity* then reports the change.

Where the data lives and how to back it up: [Operating optik](operations.md).

## Accessibility

The web UI is checked with [axe-core](https://github.com/dequelabs/axe-core) against WCAG 2.1 AA on every page (no violations), and can be used with the keyboard:

- **Navigation:** a "Skip to content" link, labelled navigation landmarks, headings in order, and visible focus indicators.
- **Reviewing:** keyboard shortcuts for the whole review (`?` lists them). The before/after slider moves with the arrow keys (Shift for bigger steps), and zoomed images scroll with the keyboard.
- **Forms and tables:** every form field and button has an accessible name; wide tables scroll with the keyboard.

Known limitation: drawing ignore regions on a screenshot needs a mouse, pen or touch.
