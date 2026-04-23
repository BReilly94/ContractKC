import { pino, type Logger as PinoLogger } from 'pino';
import { getCorrelationId } from './correlation.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function wrap(base: PinoLogger): Logger {
  const mix = (): Record<string, unknown> => {
    const cid = getCorrelationId();
    return cid ? { correlationId: cid } : {};
  };
  return {
    debug: (message, data) => base.debug({ ...mix(), ...data }, message),
    info: (message, data) => base.info({ ...mix(), ...data }, message),
    warn: (message, data) => base.warn({ ...mix(), ...data }, message),
    error: (message, data) => base.error({ ...mix(), ...data }, message),
    child: (bindings) => wrap(base.child(bindings)),
  };
}

export function createLogger(name: string, level: LogLevel = 'info'): Logger {
  const base = pino({
    name,
    level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  });
  return wrap(base);
}
