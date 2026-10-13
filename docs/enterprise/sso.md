# Single sign-on

::: info Enterprise
Part of the Enterprise edition — see [editions](/enterprise/editions).
:::

Admins add identity providers under *Single sign-on*. optik speaks **OpenID Connect** (authorization code flow with PKCE) and **SAML 2.0** (signed assertions, HTTP-Redirect / HTTP-POST); each provider becomes a button on the sign-in page.

1. **OpenID Connect:** register optik at the provider as a web application with the **redirect URI** optik shows (`https://<optik>/api/auth/sso/<id>/callback`), create a client secret, and enter issuer URL, client ID and secret in optik. *Check connection* reads the provider's discovery document.
2. **SAML:** enter the provider's entity ID, sign-in URL and signing certificate in optik, then give the provider optik's **entity ID** and **reply URL** (shown after saving) — or import optik's **metadata** (`/api/auth/sso/<id>/metadata`). Send the e-mail address and groups as attributes (names configurable; the NameID is used if there's no e-mail attribute). *Check connection* shows how long the certificate is valid.
3. Optional: **roles from groups** — map a group to *optik admin*, to a role in a project, or to a team. Roles a mapping covers follow the provider on every sign-in (the admin role if any group maps to it; the role in each project a mapping names); everything else stays managed in optik. The last admin is never demoted.
4. Optional: restrict sign-ins to e-mail domains, turn off account creation (then only invited people can sign in), and under *Passwords* allow passwords **only for admins** — they keep them as a way in if the provider is down.

| Provider | Issuer | Groups |
|---|---|---|
| Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | *Token configuration → Add groups claim* (group object IDs; for large tenants assign groups to the app) |
| Entra ID (SAML) | entity ID `https://sts.windows.net/<tenant-id>/` | groups attribute `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups`, e-mail `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| ADFS (SAML) | entity ID `http://<adfs-host>/adfs/services/trust` | claim rules for e-mail and group attributes |
| Okta | `https://<org>.okta.com` or a custom authorization server | a `groups` claim in the authorization server |
| Keycloak | `https://<host>/realms/<realm>` | client scope with a *Group Membership* mapper named `groups` |
| Google | `https://accounts.google.com` | no groups — use allowed domains |

Accounts are created on the first sign-in (role *member*) and linked to the provider's subject ID, so they survive e-mail changes; an existing account with the same e-mail address is linked. Sign-ins with an e-mail address the provider marks as unverified are refused. Behind a reverse proxy, make sure it passes `Host` / `X-Forwarded-Host` and `X-Forwarded-Proto`, or set `PUBLIC_URL` — the redirect URI is built from them.
