# Security policy

## Reporting a vulnerability

Please report vulnerabilities in optik **privately** through GitHub:
[**Report a vulnerability**](https://github.com/alexanderkrust/optik-visual-regression-testing/security/advisories/new)
(Security tab → *Report a vulnerability*). Don't open a public issue, pull request or discussion for it.

Helpful to include:

- the affected component and version (`/api/health` shows the version) — server, an adapter, the CLI, the Helm chart, the optik-renderer image;
- steps to reproduce, or a proof of concept;
- the impact as you see it, and whether it is already public.

Reports in English or German are welcome.

## What happens next

| Step | Target |
|---|---|
| Acknowledgement of your report | 3 business days |
| First assessment (confirmed or not, severity) | 10 business days |
| Fix released — critical (CVSS ≥ 9.0) | 14 days after confirmation |
| Fix released — high (7.0–8.9) | 30 days |
| Fix released — medium and low | 90 days, or the next regular release |

We keep you informed in the private advisory, agree on the publication date with you, and credit you in the advisory unless you prefer otherwise. We publish at the latest 90 days after your report, or earlier once a fix is released.

Confirmed vulnerabilities are published as [GitHub Security Advisories](https://github.com/alexanderkrust/optik-visual-regression-testing/security/advisories) with a CVE, and named in the release notes of the fixed versions.

## Supported versions

Security fixes are released for

- the **latest release**, and
- every **LTS release** still within its support period — see [Releases and support](docs/releases.md).

Older versions don't get fixes; upgrade to a supported one.

## Staying informed

optik never contacts the vendor or checks for updates by itself (see [Privacy](docs/privacy.md)). To hear about security fixes:

- *Watch* the repository on GitHub → *Custom* → **Security alerts** and **Releases**;
- the npm packages (`@optik/vitest`, `@optik/playwright`, `@optik/cypress`, `@optik/cli`) are covered by GitHub's advisory database, so Dependabot and `npm audit` report affected versions in your projects.

## Scope

In scope: the optik server (API and web UI), the adapters and the CLI, the container images (`optik`, `optik-renderer`), the Helm chart and the air-gapped bundles, and the release signatures.

Out of scope:

- your deployment: TLS, network exposure, secrets you set, the database and object storage you run;
- findings that need administrator access to the instance or physical access to the server;
- denial of service through traffic volume, and rate-limit findings without a security impact;
- missing best-practice headers without a demonstrable attack;
- vulnerabilities in dependencies that optik doesn't reach — please report those upstream.

## Safe harbour

We won't pursue legal action against research done in good faith under this policy: test only against installations you own or may test, don't access or keep other people's data beyond what's needed to show the issue, don't degrade a service for others, and give us reasonable time to fix before you publish.

## security.txt of your instance

An optik instance serves `/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) when its operator sets `SECURITY_TXT_CONTACT` — the contact is the operator's, for their installation. See the [configuration reference](docs/install/configuration.md).
