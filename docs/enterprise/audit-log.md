# Audit log

::: info Enterprise
Part of the Enterprise edition — see [editions](/enterprise/editions).
:::

Admins find under *Audit log* who did what, when and from where — sign-ins and failed attempts, accepted and rejected changes, ignore regions and thresholds, comments, users, roles and invitations, project settings, API tokens, notification channels and the license. Each event has the person (or API token), the project, the affected object, details such as old and new value, the IP address and the browser. Secrets — tokens, passwords, webhook URLs — are never recorded.

- **Search and filter** by text, event type, project and time; maintainers see the events of their projects via the API (`?project=`).
- **Export** as CSV or JSON Lines (all events matching the filter). Values a spreadsheet would run as a formula are defused.
- **Append-only:** the database refuses changes and deletions of events, and every event's SHA-256 hash covers the previous one. *Verify integrity* recomputes the chain and shows the first event that was changed in the database.
- optik never deletes audit events. Behind a reverse proxy, make sure it sets `X-Forwarded-For`, so the client's address is recorded.

Events are recorded while the Enterprise edition is in effect.
