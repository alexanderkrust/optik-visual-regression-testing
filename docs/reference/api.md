# API

All endpoints live under `/api` on the same origin as the web UI. Swagger UI: `/api/docs`.

## Health & setup

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/ready` | Readiness check (database and storage reachable) |
| GET | `/api/auth/setup` | Whether the first-run setup is still required |
| POST | `/api/auth/register` | Create the first admin account (only while no user exists) |

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Sign in, receive access + refresh tokens |
| POST | `/api/auth/refresh` | Exchange refresh token for a new access token |
| POST | `/api/auth/logout` | Revoke refresh token |

## Audit log (Enterprise; admins, or maintainers with `?project=`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audit-events` | Events, newest first. Filters: `q`, `action` (e.g. `snapshot.approved` or the prefix `snapshot.`), `project`, `from`, `to`; paging with `limit` and `before` (= `nextCursor`) |
| GET | `/api/audit-events/export` | Same filters, `format=csv` or `jsonl` |
| GET | `/api/audit-events/verify` | Recompute the hash chain (admins) |

## Single sign-on (Enterprise)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/sso/providers` | Sign-in options (public) |
| GET | `/api/auth/sso/:id/start` | Redirects to the provider (`?returnTo=/path`) |
| GET | `/api/auth/sso/:id/callback` | OIDC: the provider's redirect target |
| POST | `/api/auth/sso/:id/callback` | SAML: assertion consumer service (HTTP-POST) |
| GET | `/api/auth/sso/:id/metadata` | SAML service provider metadata |
| POST | `/api/auth/sso/exchange` | One-time code → session (used by the web UI's server) |
| GET/POST | `/api/sso/providers` | List / add providers (admin) |
| PUT/DELETE | `/api/sso/providers/:id` | Change / remove a provider (admin) |
| POST | `/api/sso/providers/:id/check` | Read the discovery document (admin) |
| GET/PUT | `/api/sso/settings` | `passwordLogin`: `all` or `admins` (admin) |

## Storage and retention

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:slug/storage` | Storage a project uses (maintainer) |
| GET | `/api/storage` | Storage per project, largest first (admin) |
| PUT | `/api/projects/:slug/retention` | Keep runs for `{ "days": 90 }` (`null` = forever; Enterprise, maintainer) |
| POST | `/api/projects/:slug/retention/run` | Clean up now (Enterprise, maintainer) |

## SCIM 2.0 (Enterprise; SCIM token)

`/api/scim/v2`: `ServiceProviderConfig`, `ResourceTypes`, `Users` and `Groups` (GET with `filter=<attribute> eq "<value>"`, `startIndex`, `count`; POST; PUT; PATCH; DELETE). Admins manage the token with `GET/POST/DELETE /api/scim/token`.

## Teams (Enterprise; admins)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/teams` | List / create teams |
| PUT/DELETE | `/api/teams/:id` | Rename / remove a team |
| POST | `/api/teams/:id/members` | Add a user by e-mail |
| DELETE | `/api/teams/:id/members/:userId` | Remove a member |
| PUT | `/api/teams/:id/projects/:slug` | Set the team's role in a project (`{ "role": null }` removes it) |
| GET | `/api/projects/:slug/teams` | Teams with access to a project (maintainer) |

## License (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/license` | Edition in effect, license details, reviewer count, problems and warnings |
| PUT | `/api/license` | Install a license key (`{ "key": "optik1.…" }`) |
| DELETE | `/api/license` | Remove the license key |

## Users (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | The signed-in user incl. role |
| GET | `/api/users` | List users (admin) |
| PATCH | `/api/users/:id` | Change a user's role (`{ role }`) or deactivate / reactivate (`{ active }`) (admin) |
| DELETE | `/api/users/:id` | Remove a user (admin) |
| POST | `/api/invitations` | Invite by email, optionally into a project (admin) |
| GET | `/api/invitations` | Pending invitations (admin) |
| DELETE | `/api/invitations/:id` | Revoke an invitation (admin) |
| GET | `/api/invitations/token/:token` | Look up an invitation link (public) |
| POST | `/api/invitations/token/:token/accept` | Set a password and sign in (public) |
| GET | `/api/projects/:slug/members` | Project members (maintainer) |
| PUT | `/api/projects/:slug/members` | Add an existing user / change their role (maintainer) |
| DELETE | `/api/projects/:slug/members/:userId` | Remove a member (maintainer) |

## Projects & runs (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/runs?project=slug` | List test runs for a project |
| GET | `/api/runs/:id` | Get a single run |
| GET | `/api/projects/:slug/tokens` | List API tokens |
| POST | `/api/projects/:slug/tokens` | Create an API token |
| DELETE | `/api/projects/:slug/tokens/:id` | Revoke an API token |
| PATCH | `/api/snapshots/:id/status` | Accept (`approved`) or reject (`rejected`) a visual change |
| PUT | `/api/snapshots/:id/settings` | Ignore regions and threshold for the snapshot's name (reviewer) |
| GET | `/api/snapshots/:id/comments` | Comments on a snapshot |
| POST | `/api/snapshots/:id/comments` | Add a comment (reviewer) |
| DELETE | `/api/snapshots/:id/comments/:commentId` | Delete a comment (author or maintainer) |
| GET | `/api/projects/:slug` | Get a project |
| PATCH | `/api/projects/:slug` | Update project settings (`defaultBranch`, `failTestsOnChanges`, `ignoreAntiAliasing`, `ciProvider`, `ciRepository`, `ciApiUrl`, `ciToken`) |
| GET | `/api/projects/:slug/notifications` | Notification channels (maintainer) |
| POST | `/api/projects/:slug/notifications` | Add a channel (maintainer) |
| DELETE | `/api/projects/:slug/notifications/:id` | Remove a channel (maintainer) |
| POST | `/api/projects/:slug/notifications/:id/test` | Send a test notification (maintainer) |

## Adapter endpoints (API token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/runs` | Start a new run |
| POST | `/api/runs/:id/complete` | Mark run complete (optional `captureKey`: the capture settings, when nothing failed) |
| POST | `/api/runs/turbosnap-base` | Commit TurboSnap compares against (`suite`, `ancestors`, `captureKey`) |
| POST | `/api/snapshots` | Submit a screenshot (multipart: `runId`, `name`, `file`, optional `browser`, `viewport`) |
| GET | `/api/snapshots/:id/image` | Serve PNG — signed URL (`imageUrl` in the snapshot) or JWT |
| GET | `/api/snapshots/:id/diff` | Serve diff PNG — signed URL (`diffUrl`) or JWT |
