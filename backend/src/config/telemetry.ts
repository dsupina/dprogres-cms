/**
 * OpenTelemetry Configuration
 * SF-011: Sets up OTEL instrumentation for traces, metrics, and logs
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

/**
 * Initialize OpenTelemetry SDK
 *
 * Environment Variables:
 * - OTEL_ENABLED: Enable/disable OTEL (default: false for dev)
 * - OTEL_ENDPOINT: OTLP collector endpoint (default: http://localhost:4318/v1/traces)
 * - OTEL_SERVICE_NAME: Service name (default: dprogres-cms-backend)
 * - OTEL_LOG_LEVEL: Diagnostic log level (default: INFO)
 */
export async function initializeTelemetry(): Promise<NodeSDK | null> {
  const otelEnabled = process.env.OTEL_ENABLED === 'true';

  if (!otelEnabled) {
    console.log('[OTEL] Telemetry disabled via OTEL_ENABLED=false');
    return null;
  }

  // Set diagnostic logging level
  const logLevel = process.env.OTEL_LOG_LEVEL || 'INFO';
  const diagLevel = {
    'ERROR': DiagLogLevel.ERROR,
    'WARN': DiagLogLevel.WARN,
    'INFO': DiagLogLevel.INFO,
    'DEBUG': DiagLogLevel.DEBUG,
    'VERBOSE': DiagLogLevel.VERBOSE,
  }[logLevel] || DiagLogLevel.INFO;

  diag.setLogger(new DiagConsoleLogger(), diagLevel);

  // Configure OTLP exporter
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: {},
  });

  // Configure resource (service identity)
  const resource = Resource.default().merge(
    new Resource({
      [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'dprogres-cms-backend',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    })
  );

  // Initialize SDK with auto-instrumentation
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations for dev
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  // Start SDK (await to handle promise rejections gracefully)
  try {
    await sdk.start();
    console.log('[OTEL] Telemetry initialized successfully');
    console.log(`[OTEL] Service: ${process.env.OTEL_SERVICE_NAME || 'dprogres-cms-backend'}`);
    console.log(`[OTEL] Endpoint: ${process.env.OTEL_ENDPOINT || 'http://localhost:4318/v1/traces'}`);

    return sdk;
  } catch (error: any) {
    // Handle async startup failures (bad endpoint, collector offline, etc.)
    console.error('[OTEL] Failed to start telemetry SDK:', error);
    console.warn('[OTEL] Continuing without telemetry - check OTEL_ENDPOINT configuration');
    return null;
  }
}

/**
 * Get OpenTelemetry API for manual instrumentation
 * Use this to create custom spans in your code
 *
 * @example
 * import { trace } from './config/telemetry';
 * const tracer = trace.getTracer('my-component');
 * const span = tracer.startSpan('my-operation');
 * // ... do work ...
 * span.end();
 */
export { trace, context, SpanStatusCode } from '@opentelemetry/api';
