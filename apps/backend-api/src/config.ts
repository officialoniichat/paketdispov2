import 'dotenv/config';

/** Centralised, validated-at-startup runtime configuration. */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.API_HOST ?? '0.0.0.0',
  port: num(process.env.API_PORT, 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: process.env.DATABASE_URL ?? '',
  otel: {
    disabled: (process.env.OTEL_SDK_DISABLED ?? 'true').toLowerCase() === 'true',
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'backend-api',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  },
} as const;

export type AppConfig = typeof config;
