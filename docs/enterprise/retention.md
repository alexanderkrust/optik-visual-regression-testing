# Storage and retention

Every project shows under *Settings → Storage and retention* how much its screenshots and diff images take; admins see it for all projects on the project list. optik records image sizes as it stores them (older images are measured by a daily job).

**Retention (Enterprise):** set how many days runs are kept. Every day — or with *Clean up now* — older runs and their images are removed, but baselines always stay: the newest accepted snapshot of each name per suite and branch, and every baseline a newer run compares against. Reviews keep working exactly as before; each clean-up appears in the audit log. With several instances, only one runs the daily job at a time.
