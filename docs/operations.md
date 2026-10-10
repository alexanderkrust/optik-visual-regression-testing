# Operating optik

High availability, backup and restore. For installation see the [README](../README.md#quick-start); for monitoring see [Monitoring](../README.md#monitoring).

## Where optik keeps its data

| What | Where | Notes |
|---|---|---|
| Projects, runs, snapshots, reviews, comments, users, teams, settings, audit log | PostgreSQL | Everything except the images |
| Generated secrets (`JWT_SECRET`, `SESSION_SECRET`) | PostgreSQL (`instance_settings`) | Unless you set them yourself — then back up that Secret too |
| License key | PostgreSQL, or `OPTIK_LICENSE` | |
| Screenshots and diff images | S3 bucket, or the local directory `STORAGE_DIR` (`/data` in the image) | |

Encrypted values in the database — CI tokens, notification webhook URLs, identity provider secrets — can only be read with the `JWT_SECRET` they were encrypted with. Keep database and secret together.

optik itself keeps no state on disk or in memory that matters: any instance can serve any request.

## High availability

Run several optik instances behind a load balancer:

- **Images in S3** (`S3_BUCKET` …) — a local directory can only be used by one instance. The Helm chart refuses `replicaCount > 1` or autoscaling without S3.
- **A PostgreSQL with failover** (managed service, Patroni, CloudNativePG, …). The bundled PostgreSQL of the Helm chart is a single instance.
- **The same `JWT_SECRET` / `SESSION_SECRET`** on all instances — automatic when optik generates them (they are in the database).
- **The load balancer passes `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto`,** or set `PUBLIC_URL`. Links optik builds — single sign-on redirect URIs, links in commit statuses and notifications — use them.

What works across instances:

- **Sign-ins:** sessions (signed tokens, refresh tokens in the database) and the limit for failed sign-ins (in the database).
- **Single sign-on:** an OIDC or SAML sign-in may start on one instance and finish on another; SAML requests are checked once, in the database.
- **Housekeeping:** the daily job (storage measurement, retention) runs on one instance at a time — it takes a lease in the database that expires if that instance stops.
- **Migrations:** they run on start; Prisma serialises concurrent starts with a database lock.
- **Diffing:** each instance has its own worker threads (`DIFF_WORKERS`), so diffing scales with the instances.

Helm:

```yaml
replicaCount: 3            # or autoscaling.enabled: true
storage:
  s3: { enabled: true, bucket: optik-snapshots, existingSecret: optik-s3 }
postgresql: { enabled: false }
database: { existingSecret: optik-db }
# PodDisruptionBudget and spreading over nodes/zones are on by default with several replicas
```

## Backup

Back up the **database first, then the images**. Images written in between are only extra files; the other way round, the database could reference images that are not in the backup.

### PostgreSQL

Use what your database already offers — continuous archiving / point-in-time recovery of a managed PostgreSQL or an operator is best. Otherwise, a daily logical dump:

```bash
pg_dump --format=custom --file=optik-$(date +%F).dump "$DATABASE_URL"
```

Docker Compose (bundled database):

```bash
docker compose exec -T postgres pg_dump -U optik -d optik --format=custom > optik-$(date +%F).dump
```

Kubernetes — a CronJob next to optik:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: optik-db-backup }
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: pg-dump
              image: postgres:16-alpine
              command: [sh, -c, 'pg_dump --format=custom --file=/backup/optik-$(date +%F).dump "$DATABASE_URL"']
              env:
                - name: DATABASE_URL
                  valueFrom: { secretKeyRef: { name: optik-db, key: DATABASE_URL } }
              volumeMounts: [{ name: backup, mountPath: /backup }]
          volumes:
            - name: backup
              persistentVolumeClaim: { claimName: optik-backups }
```

The audit log is append-only (a trigger refuses changes and deletions); dumps and restores are not affected.

### Images

- **S3:** turn on bucket versioning, and replication to another region or provider if you need it. Or copy the bucket regularly (`aws s3 sync`, `rclone sync`).
- **Local directory:** a volume snapshot, or an archive of `STORAGE_DIR`:

  ```bash
  docker compose exec -T optik tar -C /data -czf - . > optik-images-$(date +%F).tar.gz
  ```

Retention policies (Enterprise) delete old images on purpose — keep that in mind when you size backup retention.

## Restore

1. Stop optik (all instances).
2. Restore the database into an **empty** database:

   ```bash
   createdb optik
   pg_restore --no-owner --exit-on-error -d "$DATABASE_URL" optik-2026-10-10.dump
   ```

3. Restore the images to the bucket or `STORAGE_DIR`.
4. If you set `JWT_SECRET` / `SESSION_SECRET` yourself, use the same values as at backup time.
5. Start optik — **the same or a newer version**. A newer version runs its migrations on start; an older one than the backup's is not supported.
6. Check:
   - `GET /api/ready` answers `200`;
   - sign in, open a run with visual changes — before, after and diff images appear;
   - Enterprise: *Audit log → Verify integrity* reports all events unchanged.

Test the restore regularly, e.g. into a separate database and a copy of the bucket.
