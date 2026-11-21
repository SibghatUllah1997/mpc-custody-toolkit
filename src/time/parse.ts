import { InputError } from '../errors/input.js';
import {
  DURATION_MS,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  UTC_TIMESTAMP_RE,
  type DurationUnit,
} from './types.js';

const DURATION_RE = /^([1-9]\d*)([smhd])$/;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

/** Format a Date as an ISO-8601 UTC timestamp with milliseconds. */
export function formatUtcTimestamp(now: Date = new Date()): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InputError('invalid-type', 'now must be a valid Date', 'now');
  }
  return now.toISOString();
}

/**
 * Parse a UTC timestamp. Offsets other than `Z`, local times, and calendar
 * dates that do not exist (31 February) are refused.
 */
export function parseUtcTimestamp(value: unknown, field = 'timestamp'): Date {
  if (typeof value !== 'string' || !UTC_TIMESTAMP_RE.test(value)) {
    throw new InputError(
      'invalid-type',
      `${field} must be an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ssZ)`,
      field
    );
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new InputError('invalid-range', `${field} is not a real calendar date`, field);
  }
  const date = new Date(ms);
  const expected = value.endsWith('Z') && value.includes('.')
    ? `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}.${pad3(date.getUTCMilliseconds())}Z`
    : `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}Z`;
  // Timestamps without millis must land on a whole second; with millis they
  // must round-trip the exact instant, so 31 Feb cannot sneak through.
  const written = value.includes('.') ? value : value.replace(/Z$/, '') + 'Z';
  const comparable = value.includes('.') ? expected : expected.replace(/\.\d{3}Z$/, 'Z');
  if (comparable !== written) {
    throw new InputError('invalid-range', `${field} is not a real calendar date`, field);
  }
  return date;
}

/** Parse a compact duration such as `30s`, `15m`, `2h`, or `7d`. */
export function parseDuration(value: unknown, field = 'ttl'): number {
  if (typeof value !== 'string' || !DURATION_RE.test(value)) {
    throw new InputError('invalid-type', `${field} must look like 30s, 15m, 2h, or 7d`, field);
  }
  const [, digits, unit] = value.match(DURATION_RE)!;
  const amount = Number(digits);
  const ms = amount * DURATION_MS[unit as DurationUnit];
  if (!Number.isSafeInteger(ms) || ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) {
    throw new InputError(
      'invalid-range',
      `${field} must be between 1s and 30d`,
      field
    );
  }
  return ms;
}

/** Instant `ttl` after `now`, as a UTC timestamp with milliseconds. */
export function deadlineFromTtl(ttl: string, now: Date = new Date(), field = 'ttl'): string {
  const ms = parseDuration(ttl, field);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InputError('invalid-type', 'now must be a valid Date', 'now');
  }
  return formatUtcTimestamp(new Date(now.getTime() + ms));
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  const deadline = parseUtcTimestamp(expiresAt, 'expiresAt');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InputError('invalid-type', 'now must be a valid Date', 'now');
  }
  return now.getTime() >= deadline.getTime();
}

/**
 * Fail closed once `now` reaches `expiresAt`. Equal times count as expired.
 */
export function assertNotExpired(expiresAt: string, now: Date = new Date(), field = 'expiresAt'): void {
  if (isExpired(expiresAt, now)) {
    throw new InputError('expired', `${field} ${expiresAt} has passed`, field);
  }
}
