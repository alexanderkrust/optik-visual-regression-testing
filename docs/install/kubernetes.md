# Kubernetes (Helm)

```bash
helm install optik oci://ghcr.io/alexanderkrust/charts/optik --version <version>
```

The default install bundles a single PostgreSQL instance and stores screenshots on a volume — good for evaluation. For production, point it to your own database and S3 storage, e.g.:

```bash
helm install optik oci://ghcr.io/alexanderkrust/charts/optik --version <version> \
  --set postgresql.enabled=false \
  --set database.existingSecret=optik-db \
  --set storage.s3.enabled=true \
  --set storage.s3.bucket=optik \
  --set storage.s3.existingSecret=optik-s3 \
  --set ingress.enabled=true \
  --set 'ingress.hosts[0].host=optik.example.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

All options are documented in [charts/optik/values.yaml](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/charts/optik/values.yaml). With S3 storage, optik can run several replicas.
