# Security

optik runs in your infrastructure and never contacts the vendor — see [Privacy](/privacy) for every outgoing connection and the personal data it stores. Releases are signed and come with SBOMs: [verifying releases](/security/verifying-releases).

## Built in

- **Images are private.** The API returns signed, expiring image URLs (1–2 h) with every snapshot; image endpoints accept only those or a signed-in user's JWT.
- **API and refresh tokens are stored hashed** (SHA-256); an API token is shown once on creation, the UI shows its prefix.
- **Failed sign-ins are limited per account** (`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`), counted in the database for all instances.
- **Security headers**: Content-Security-Policy for the web UI, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS over HTTPS.

## Reporting vulnerabilities

Report vulnerabilities in optik privately on GitHub — see [SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md) for the process, response times and supported versions.

Fix targets, supported versions and the disclosure process are in the [security policy](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md); which releases get fixes, and for how long, in [Releases and support](/releases).

## security.txt for your installation

Set `SECURITY_TXT_CONTACT` to publish your security contact for your optik installation at `/.well-known/security.txt` ([configuration](/install/configuration)).
