import pino, { type LoggerOptions } from 'pino';
import { config } from '../config.js';

/**
 * Structured JSON logging (§12 Observability).
 * Production/CI: newline-delimited JSON with ISO timestamps and secret redaction.
 * Development: human-readable pretty output.
 */
const redact = {
  paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
  remove: true,
};

const base = { service: config.otel.serviceName, env: config.env };

export const loggerOptions: LoggerOptions =
  config.env === 'development'
    ? {
        level: config.logLevel,
        base,
        redact,
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:standard', colorize: true },
        },
      }
    : {
        level: config.logLevel,
        base,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: { level: (label) => ({ level: label }) },
        redact,
      };

/** Standalone logger for non-request contexts (startup, telemetry, workers). */
export const logger = pino(loggerOptions);
