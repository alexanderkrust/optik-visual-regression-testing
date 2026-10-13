# Handling a vulnerability report

For maintainers. The public policy is [SECURITY.md](../../SECURITY.md).

Reports arrive as **draft security advisories** (GitHub → Security → Advisories). Everything below happens inside the advisory until publication — never in public issues, pull requests or commit messages that name the problem.

## One-time setup

- Settings → Code security → **Private vulnerability reporting: enabled** (without it, the link in SECURITY.md leads nowhere).
- Settings → Code security → Dependabot alerts and security updates enabled.

## 1. Triage (within 3 business days)

1. Acknowledge in the advisory's comments.
2. Reproduce on the latest release and on every supported LTS line ([releases](../releases.md)).
3. Score it with CVSS 3.1 in the advisory form; set the affected versions (`<0.4.2`, `>=0.3.0 <0.3.5` …) and packages (npm packages for adapter/CLI issues; the server is "Other": `ghcr.io/…/optik`).
4. Not a vulnerability? Explain, and close the advisory.

## 2. Fix in private

1. In the advisory: **Start a temporary private fork**. Work there — CI doesn't run in private forks, so run the checks locally (`pnpm turbo build lint test`, API e2e).
2. Fix on `main` and on each supported `release/x.y` branch.
3. Add a changeset whose summary starts with **`Security:`** — it lands in the release notes. Describe the fix, not the exploit.
4. Invite the reporter to the fork if they want to check the fix.

## 3. Release and publish (same day)

1. Request a CVE in the advisory (*Request CVE*), if not done yet.
2. Merge the private fork's pull requests from the advisory, then release: the "Version Packages" pull request on `main`, and the same on each LTS branch.
3. When the releases are out: set the patched versions in the advisory and **Publish advisory**. GitHub then notifies watchers and Dependabot users.
4. Credit the reporter (advisory → Credits), unless they declined.

## Targets

| Severity (CVSS) | Fix released |
|---|---|
| Critical (≥ 9.0) | 14 days after confirmation |
| High (7.0–8.9) | 30 days |
| Medium, low | 90 days or the next regular release |

Publication at the latest 90 days after the report, agreed with the reporter.
