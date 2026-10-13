# Upgrading

1. **Read the release notes** of every release between yours and the new one — at least their *Security fixes* and *Upgrade notes* ([releases](https://github.com/alexanderkrust/optik-visual-regression-testing/releases)).
2. **Back up the database and the images** ([backup](operations.md#backup)). Migrations can't be undone; the backup is the way back.
3. **Upgrade:**
   - Helm: `helm upgrade optik oci://ghcr.io/alexanderkrust/charts/optik --version <version> --reuse-values`
   - Docker Compose: set the image tag in `docker-compose.yml`, then `docker compose pull && docker compose up -d`
   - Air-gapped: load the new bundle as described in its `INSTALL.md`
4. **Check** that `GET /api/ready` answers `200` and `GET /api/health` shows the new version, then open a run with changes.

Migrations run when the new version starts. With several instances, Prisma lets one instance apply them while the others wait; old and new instances don't run side by side for long during a rolling update, but a release that needs them stopped first says so in its upgrade notes.

Update the adapters and the CLI (`@optik/*` npm packages) to the same version when you can. Older adapters keep working with a newer server within the same major version; a newer adapter may need a server that knows its features — the release notes say so.

## Going back

Database migrations only go forward. To return to the previous version, stop optik, restore the backup taken in step 2 ([restore](operations.md#restore)) and start the previous image. Runs and reviews made after the backup are lost — so check the upgrade soon after it.
