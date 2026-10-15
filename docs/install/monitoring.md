# Monitoring

- **Metrics:** Prometheus format at `/api/metrics` — HTTP requests by route, submitted snapshots by result, diff duration and queue, completed runs, reviews, open changes, notification and commit status deliveries, the license edition, and Node.js process metrics. Protect it with `METRICS_TOKEN`; the Helm chart can create a `ServiceMonitor` (`metrics.serviceMonitor.enabled`).
- **Logs:** `LOG_FORMAT=json` writes one JSON object per line, including an access log. Every request gets an `X-Request-Id` (taken over from a proxy if present), which appears in the logs and the response.
- **Tracing:** with `OTEL_EXPORTER_OTLP_ENDPOINT` set, optik sends OpenTelemetry traces of incoming requests, database queries and outgoing calls (CI systems, notifications, identity providers). Without it, nothing is loaded.
