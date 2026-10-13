# Without internet access

Every release has an air-gapped bundle per architecture (`optik-<version>-airgap-amd64.tar.gz`, `…-arm64.tar.gz`) with the optik and PostgreSQL images, a ready-to-use `docker-compose.yml`, the Helm chart and an `INSTALL.md`:

```bash
tar -xzf optik-<version>-airgap-amd64.tar.gz && cd optik-<version>-airgap-amd64
sha256sum -c SHA256SUMS
docker load -i images.tar
docker compose up -d
```

For Kubernetes, `INSTALL.md` explains how to copy the images into an internal registry and install the chart from the bundle.
