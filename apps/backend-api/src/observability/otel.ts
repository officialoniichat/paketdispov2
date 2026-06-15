import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { config } from '../config.js';
import { logger } from './logger.js';

let sdk: NodeSDK | undefined;

/**
 * OpenTelemetry baseline (§12). Disabled by default (OTEL_SDK_DISABLED=true) so
 * local dev runs without a collector; enable by pointing at an OTLP endpoint.
 */
export function startTelemetry(): void {
  if (config.otel.disabled) {
    logger.info('OpenTelemetry disabled (OTEL_SDK_DISABLED=true)');
    return;
  }

  sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: config.otel.serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${config.otel.endpoint}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  logger.info({ endpoint: config.otel.endpoint }, 'OpenTelemetry started');
}

export async function stopTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
