---
"@optik/api": minor
---

Observability: Prometheus metrics at `/api/metrics` (optional `METRICS_TOKEN`; the Helm chart can create a ServiceMonitor), JSON logs with an access log (`LOG_FORMAT=json`, default in the Helm chart), request IDs (`X-Request-Id`) and OpenTelemetry tracing when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
