/** Strict UTC instant: `YYYY-MM-DDTHH:mm:ssZ` or with milliseconds. */
export const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type DurationUnit = 's' | 'm' | 'h' | 'd';

export const DURATION_MS: Readonly<Record<DurationUnit, number>> = Object.freeze({
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
});

/** Shortest ttl: one second. */
export const MIN_DURATION_MS = DURATION_MS.s;
/** Longest ttl: thirty days. */
export const MAX_DURATION_MS = 30 * DURATION_MS.d;

export const DURATION_UNITS = Object.freeze(Object.keys(DURATION_MS) as DurationUnit[]);
