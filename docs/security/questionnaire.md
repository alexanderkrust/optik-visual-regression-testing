# Security questionnaire answers

Answers to the questions security questionnaires usually ask, grouped by the domains of the CSA **CAIQ v4** (Consensus Assessments Initiative Questionnaire). Use them to fill in CAIQ, SIG Lite or your own questionnaire; the [security whitepaper](/security/whitepaper) explains the details.

Because optik is **self-hosted**, many controls are yours as the operator. Each answer says who is responsible:

- **optik** — built into the software, or done by the vendor for the software;
- **operator** — you, for your installation;
- **shared** — optik provides the feature, you configure and use it.

::: warning To be completed by the vendor
Questions about the vendor as an organisation — certifications, staff screening, insurance, corporate policies — are marked *Vendor to complete*. They don't follow from the software and are answered in the vendor's own documents.
:::

## A&A — Audit and assurance

| Question | Answer | Who |
|---|---|---|
| Independent audits or certifications (ISO 27001, SOC 2)? | Vendor to complete. | optik |
| Penetration tests? | An external test is being prepared — [scope and rules](/security/penetration-test). Results will be summarised for customers on request. | optik |
| Can customers audit the software? | Yes: the source code is public, releases are reproducible from the tagged commit and carry SBOMs and provenance; customers may test their own installation under [SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md)'s safe harbour. | optik |

## AIS — Application and interface security

| Question | Answer | Who |
|---|---|---|
| Secure development practices? | Pull requests with automated checks (type checks, unit, integration and image tests); dependency pinning; signed releases. | optik |
| Input validation, injection protection? | Inputs are validated in the services; database access only through parameterised queries (Prisma); uploads limited in file size and pixels (checked before decoding) and decoded in worker threads; outbound requests to configured URLs are checked against loopback, link-local and cloud metadata addresses; CSV export defuses formulas. | optik |
| Web security headers? | CSP `default-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS over HTTPS. | optik |
| API authentication? | Users: short-lived JWTs (15 min) behind an encrypted session cookie; CI: project-scoped API tokens stored as hashes; SCIM and metrics: separate tokens. | optik |

## BCR — Business continuity and operational resilience

| Question | Answer | Who |
|---|---|---|
| High availability? | Stateless instances behind a load balancer; Helm chart with replicas, autoscaling, PodDisruptionBudget, spreading over zones. | shared |
| Backups and restore tested? | Documented procedure for database and images, with a restore test ([operations](/operations)); performing and testing backups is yours. | operator |
| RTO / RPO? | Depend on your database and storage setup. | operator |

## CCC — Change control and configuration management

| Question | Answer | Who |
|---|---|---|
| How are changes to the software controlled? | Every change through a pull request with CI; versioned releases with changelogs; security fixes and upgrade notes are listed first ([releases](/releases)). | optik |
| How are upgrades applied? | By you, when you choose; migrations run on start; documented rollback through backup ([upgrading](/upgrading)). | operator |
| Configuration baseline? | Environment variables and Helm values, documented in the [configuration reference](/install/configuration). | operator |

## CEK — Cryptography, encryption and key management

| Question | Answer | Who |
|---|---|---|
| Encryption in transit? | TLS is terminated by your ingress or load balancer; HSTS is sent over HTTPS. Outgoing calls to integrations use HTTPS URLs you configure. | shared |
| Encryption at rest? | Stored credentials (CI tokens, webhook URLs, identity provider secrets) are encrypted with AES-256-GCM. Disk or database encryption: your PostgreSQL and storage. | shared |
| Password storage? | bcrypt, cost factor 10. | optik |
| Key management? | `JWT_SECRET` and `SESSION_SECRET` are generated on first start if you don't set them, and stored in the database; you can supply them from a secret store (`*_FILE` variables). Rotating `JWT_SECRET` invalidates sessions and stored credentials (re-enter them). | operator |
| Release signing? | cosign (keyless, GitHub OIDC); license keys use Ed25519 with an offline private key. | optik |

## DSP — Data security and privacy

| Question | Answer | Who |
|---|---|---|
| What personal data is processed? | Account e-mail addresses, names in reviews and comments, IP address and browser in the audit log, and whatever your screenshots show — see [privacy](/privacy). | shared |
| Is data sent to the vendor? | No. No telemetry, no license server, no update check. | optik |
| Data location? | Wherever you run optik, PostgreSQL and the bucket. | operator |
| Data deletion? | Removing an account removes its personal data except in the append-only audit log (documented, with a database procedure for erasure requests); retention policies (Enterprise) remove old runs and images. | shared |
| Is a DPA (data processing agreement) needed? | Not with the vendor for the software itself — the vendor doesn't process your data. Support access, if you grant it, is covered in the support terms. | operator |

## GRC — Governance, risk and compliance

| Question | Answer | Who |
|---|---|---|
| Information security policy, risk management? | Vendor to complete. | optik |
| Security contact? | Private reporting on GitHub ([SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md)). | optik |

## HRS — Human resources

| Question | Answer | Who |
|---|---|---|
| Background checks, security training, confidentiality agreements? | Vendor to complete. | optik |

## IAM — Identity and access management

| Question | Answer | Who |
|---|---|---|
| Single sign-on? | OpenID Connect and SAML 2.0 (Enterprise). | shared |
| MFA? | Through your identity provider with single sign-on; password sign-in can be limited to admins. optik has no own second factor. | shared |
| Provisioning and deprovisioning? | SCIM 2.0 (Enterprise); deactivation ends sessions and API access immediately. | shared |
| Role-based access? | Instance and project roles, teams; least privilege by default for invited members (only their projects). | shared |
| Brute-force protection? | Failed sign-ins limited per account, shared by all instances. | optik |
| Session timeout? | Access tokens 15 min, refresh tokens 7 days (configurable); sign-out revokes. | optik |
| Privileged access reviews? | The *Users* and *Teams* pages and the audit log show who has which role; reviewing is yours. | operator |

## IPY — Interoperability and portability

| Question | Answer | Who |
|---|---|---|
| Data export? | Audit log as CSV / JSON Lines; all data is in your PostgreSQL and bucket in documented formats; a REST API with OpenAPI description (`/api/docs`). | shared |
| Exit / lock-in? | The core is Apache-2.0 open source; without a license optik keeps running as Community edition — nothing is locked or deleted. | optik |

## IVS — Infrastructure and virtualisation security

| Question | Answer | Who |
|---|---|---|
| Hardened container? | Alpine-based image, runs as an unprivileged user; Helm chart: non-root, all capabilities dropped, no privilege escalation, memory limit. | shared |
| Network segmentation? | One port; restrict ingress and egress with your network policies. optik only calls the integrations you configure. | operator |

## LOG — Logging and monitoring

| Question | Answer | Who |
|---|---|---|
| Security event logging? | Audit log (Enterprise) of sign-ins, failures, permission and setting changes, tokens and reviews, tamper-evident; JSON application logs with request IDs. | shared |
| Log retention and SIEM integration? | Audit events are kept in the database (export as JSON Lines); application logs go to stdout for your log system. | operator |
| Monitoring? | Prometheus metrics, OpenTelemetry tracing, health and readiness endpoints. | shared |

## SEF — Security incident management

| Question | Answer | Who |
|---|---|---|
| Vulnerability disclosure and response? | [SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md): acknowledgement within 3 business days, fixes within 14 (critical) / 30 (high) / 90 days, advisories with CVEs. | optik |
| Customer notification of vulnerabilities? | GitHub Security Advisories and release notes; watch the repository for security alerts. | optik |
| Incidents in your installation? | Your incident process; the audit log and logs support the investigation. | operator |

## STA — Supply chain management, transparency and accountability

| Question | Answer | Who |
|---|---|---|
| SBOM? | SPDX SBOM per release, attached and as a signed registry attestation. | optik |
| Provenance? | SLSA provenance attestations; releases built in GitHub Actions. | optik |
| Third-party components? | Open-source dependencies pinned in the lockfile, listed in the SBOM; Dependabot monitors them. | optik |

## TVM — Threat and vulnerability management

| Question | Answer | Who |
|---|---|---|
| Dependency scanning? | Dependabot alerts and weekly update pull requests for npm, GitHub Actions and base images. | optik |
| Patch timelines? | See SEF; LTS releases get security fixes for 18 months ([releases](/releases)). | optik |
| Known open issues? | Listed in the whitepaper's [known limitations](/security/whitepaper#known-limitations). | optik |
| Applying patches? | Yours — subscribe to releases and upgrade. | operator |

## UEM — Universal endpoint management

Not applicable: optik has no endpoint agent; it runs as a server application. The adapters run in your CI and on developer machines as npm packages.
