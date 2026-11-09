import { levelEnabled, parseLogLevel, type LogLevel } from './levels.js';

export type LogSink = (line: string) => void;

export type LoggerOptions = {
  level?: LogLevel;
  /** Defaults to stderr so JSON on stdout stays machine-readable. */
  sink?: LogSink;
  /** When false, omit the level prefix. Default true. */
  prefix?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type Logger = {
  level: LogLevel;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
  debug: (message: string) => void;
};

export const LOG_LEVEL_ENV = 'MPC_LOG_LEVEL';

export function resolveLogLevel(opts?: { level?: LogLevel; env?: NodeJS.ProcessEnv }): LogLevel {
  if (opts?.level) return opts.level;
  const env = opts?.env ?? process.env;
  const raw = env[LOG_LEVEL_ENV];
  if (raw === undefined || raw === '') return 'info';
  return parseLogLevel(raw, 'info');
}

function emit(sink: LogSink, prefix: boolean, level: LogLevel, message: string): void {
  sink(prefix ? `${level}: ${message}` : message);
}

/**
 * Small leveled logger. Messages at or below the configured level are written
 * to the sink; others are dropped. Default level is info.
 */
export function createLogger(opts?: LoggerOptions): Logger {
  const level = resolveLogLevel(opts);
  const sink = opts?.sink ?? ((line: string) => console.error(line));
  const prefix = opts?.prefix !== false;

  const write = (incoming: LogLevel, message: string): void => {
    if (!levelEnabled(level, incoming)) return;
    emit(sink, prefix, incoming, message);
  };

  return {
    level,
    error: (message) => write('error', message),
    warn: (message) => write('warn', message),
    info: (message) => write('info', message),
    debug: (message) => write('debug', message),
  };
}
