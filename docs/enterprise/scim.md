# Provisioning with SCIM

::: info Enterprise
Part of the Enterprise edition — see [editions](/enterprise/editions).
:::

Entra ID, Okta and other identity providers can manage optik's accounts over SCIM 2.0: under *Single sign-on → Provisioning (SCIM)*, create a token and enter it at the provider together with the SCIM base URL (`https://<optik>/api/scim/v2`).

- **Users** become optik accounts (e-mail = `userName`, without a password — they sign in with single sign-on). Deactivating them at the provider **deactivates** them in optik: running sessions end, sign-in and API access are refused, they no longer count as reviewers, and their reviews and comments stay. Deleting removes the account.
- **Groups** become **teams** with the same members; give the teams roles in projects under *Teams*.
- Every change appears in the audit log as made by *SCIM*. The last admin is never deactivated or deleted.

Admins can also deactivate and reactivate accounts by hand under *Users*.
