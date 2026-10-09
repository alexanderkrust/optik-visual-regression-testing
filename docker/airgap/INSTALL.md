# optik __VERSION__ — air-gapped installation (__ARCH__)

This bundle contains everything to run optik without internet access:

| File | Content |
|------|---------|
| `images.tar` | Docker images: `ghcr.io/alexanderkrust/optik:__VERSION__`, `postgres:__POSTGRES_TAG__` (linux/__ARCH__) |
| `docker-compose.yml` | optik + PostgreSQL, using only the images above |
| `optik-__VERSION__.tgz` | Helm chart |
| `SHA256SUMS` | checksums of all files |

Check the files first:

```bash
sha256sum -c SHA256SUMS
```

## Docker Compose

```bash
docker load -i images.tar
docker compose up -d
```

Open `http://<host>:3000` and create the administrator account. Set
`POSTGRES_PASSWORD` (and optionally `OPTIK_PORT`) in the environment or an
`.env` file next to `docker-compose.yml` before the first start.

## Kubernetes

Copy the images into your internal registry, e.g. with
[crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md)
or `docker load` + `docker tag` + `docker push`:

```bash
docker load -i images.tar
docker tag ghcr.io/alexanderkrust/optik:__VERSION__ registry.example.com/optik:__VERSION__
docker tag postgres:__POSTGRES_TAG__ registry.example.com/postgres:__POSTGRES_TAG__
docker push registry.example.com/optik:__VERSION__
docker push registry.example.com/postgres:__POSTGRES_TAG__
```

Install the chart from the bundle:

```bash
helm install optik ./optik-__VERSION__.tgz \
  --set image.repository=registry.example.com/optik \
  --set postgresql.image.repository=registry.example.com/postgres
```

For production use an external database and S3 storage — see `values.yaml` in
the chart (`helm show values ./optik-__VERSION__.tgz`).

## Verifying the bundle

The bundle archive is signed with cosign (keyless). With the `.sigstore.json`
file from the release:

```bash
cosign verify-blob optik-__VERSION__-airgap-__ARCH__.tar.gz \
  --bundle optik-__VERSION__-airgap-__ARCH__.tar.gz.sigstore.json \
  --certificate-identity-regexp '^https://github.com/alexanderkrust/optik-visual-regression-testing/\.github/workflows/release\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```
