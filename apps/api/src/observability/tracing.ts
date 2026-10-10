/**
 * OpenTelemetry tracing — only when an OTLP endpoint is configured
 * (OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT; the
 * standard OTEL_* variables apply). Traces incoming and outgoing HTTP
 * requests and PostgreSQL queries. Imported first in main.ts, so the
 * instrumentation is in place before those modules load; without an endpoint
 * nothing is loaded at all.
 */
import type { NodeSDK } from '@opentelemetry/sdk-node';

const QUIET = /^\/api\/(health|ready|metrics)\b/;

export function startTracing(env: NodeJS.ProcessEnv = process.env): NodeSDK | null {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT && !env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return null;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http') as typeof import('@opentelemetry/instrumentation-http');
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg') as typeof import('@opentelemetry/instrumentation-pg');
  const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici') as typeof import('@opentelemetry/instrumentation-undici');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME ?? 'optik',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => QUIET.test(req.url ?? '') }),
      new PgInstrumentation(),
      // fetch(): CI systems, notifications, identity providers
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
  return sdk;
}

startTracing();
