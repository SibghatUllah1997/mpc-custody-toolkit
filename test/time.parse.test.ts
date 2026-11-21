import { describe, expect, it } from 'vitest';
import {
  assertNotExpired,
  deadlineFromTtl,
  formatUtcTimestamp,
  isExpired,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  parseDuration,
  parseUtcTimestamp,
  UTC_TIMESTAMP_RE,
} from '../src/time';
import { InputError } from '../src/errors';

function expectCode(fn: () => unknown, code: InputError['code'], pattern?: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    if (pattern) expect((err as InputError).message).toMatch(pattern);
  }
}

describe('parseUtcTimestamp', () => {
  it('accepts whole-second and millisecond UTC instants', () => {
    expect(parseUtcTimestamp('2026-11-21T06:47:22Z').toISOString()).toBe('2026-11-21T06:47:22.000Z');
    expect(parseUtcTimestamp('2026-11-21T06:47:22.500Z').toISOString()).toBe('2026-11-21T06:47:22.500Z');
    expect(UTC_TIMESTAMP_RE.test('2026-11-21T06:47:22Z')).toBe(true);
    expect(UTC_TIMESTAMP_RE.test('2026-11-21T06:47:22+05:00')).toBe(false);
  });

  it('rejects offsets, missing Z, and dates that are not on the calendar', () => {
    expectCode(() => parseUtcTimestamp('2026-11-21T06:47:22+05:00'), 'invalid-type', /UTC timestamp/);
    expectCode(() => parseUtcTimestamp('2026-11-21 06:47:22Z'), 'invalid-type');
    expectCode(() => parseUtcTimestamp('2026-02-31T00:00:00Z'), 'invalid-range', /calendar date/);
    expectCode(() => parseUtcTimestamp('2026-13-01T00:00:00Z'), 'invalid-range', /calendar date/);
    expectCode(() => parseUtcTimestamp(12), 'invalid-type');
    expectCode(() => parseUtcTimestamp('2026-11-21T06:47:22.5Z'), 'invalid-type');
  });
});

describe('parseDuration / deadlineFromTtl', () => {
  it('converts compact ttl strings to milliseconds', () => {
    expect(parseDuration('1s')).toBe(MIN_DURATION_MS);
    expect(parseDuration('15m')).toBe(15 * 60_000);
    expect(parseDuration('2h')).toBe(2 * 3_600_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('30d')).toBe(MAX_DURATION_MS);
  });

  it('rejects zero, fractions, unknown units, and values over 30 days', () => {
    expectCode(() => parseDuration('0s'), 'invalid-type', /30s/);
    expectCode(() => parseDuration('1.5h'), 'invalid-type');
    expectCode(() => parseDuration('1x'), 'invalid-type');
    expectCode(() => parseDuration(' 2h'), 'invalid-type');
    expectCode(() => parseDuration('31d'), 'invalid-range', /1s and 30d/);
    expectCode(() => parseDuration('1000000000d'), 'invalid-range');
  });

  it('adds the ttl to a fixed now', () => {
    const now = new Date('2026-11-21T06:47:22.000Z');
    expect(deadlineFromTtl('1h', now)).toBe('2026-11-21T07:47:22.000Z');
    expect(deadlineFromTtl('30s', now)).toBe('2026-11-21T06:47:52.000Z');
    expectCode(() => deadlineFromTtl('1h', new Date(Number.NaN)), 'invalid-type', /now/);
  });
});

describe('isExpired / assertNotExpired', () => {
  const deadline = '2026-11-21T08:00:00.000Z';

  it('treats the deadline instant as expired', () => {
    expect(isExpired(deadline, new Date('2026-11-21T07:59:59.999Z'))).toBe(false);
    expect(isExpired(deadline, new Date('2026-11-21T08:00:00.000Z'))).toBe(true);
    expect(isExpired(deadline, new Date('2026-11-21T08:00:00.001Z'))).toBe(true);
  });

  it('throws an expired InputError once the deadline has passed', () => {
    assertNotExpired(deadline, new Date('2026-11-21T07:59:59.999Z'));
    expectCode(
      () => assertNotExpired(deadline, new Date('2026-11-21T08:00:00.000Z')),
      'expired',
      /has passed/
    );
  });

  it('formats a Date as a millisecond UTC timestamp', () => {
    expect(formatUtcTimestamp(new Date('2026-11-21T06:47:22Z'))).toBe('2026-11-21T06:47:22.000Z');
    expectCode(() => formatUtcTimestamp(new Date(Number.NaN)), 'invalid-type', /now/);
  });
});
