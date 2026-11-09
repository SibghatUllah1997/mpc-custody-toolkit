export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

export function parseLogLevel(value: unknown, fallback: LogLevel = 'info'): LogLevel {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const lowered = value.trim().toLowerCase();
  if (isLogLevel(lowered)) return lowered;
  throw new Error(`log level must be one of ${LOG_LEVELS.join(', ')}`);
}

export function levelEnabled(current: LogLevel, incoming: LogLevel): boolean {
  return RANK[incoming] <= RANK[current];
}
