/**
 * Rolling spend window on a matched limit. The policy names a window and a
 * cumulative cap; the caller supplies recent spends as `SpendActivity` so
 * evaluation stays a pure function of its inputs.
 *
 * Times are whole Unix seconds. Events dated in the future still count as
 * recent, so clock skew can only make the check stricter.
 */

import { parseDecimalInteger } from './amount.js';
import type { DenialReason, SpendLimit } from './types.js';

const ASSET = /^(\*|[A-Z][A-Z0-9]{0,15})$/;

function isAssetCode(value: unknown): value is string {
  return typeof value === 'string' && ASSET.test(value);
}

/** Longest spend window accepted: 30 days. */
export const MAX_WINDOW_SECONDS = 30 * 24 * 60 * 60;
/** Cap on history events passed to one evaluation. */
export const MAX_SPEND_EVENTS = 10_000;

export type SpendEvent = {
  asset: string;
  /** Canonical non-negative decimal integer string. */
  value: string;
  /** Unix seconds when the spend was recorded. */
  at: number;
};

export type SpendActivity = {
  /** Current Unix time in seconds. */
  now: number;
  /** Earlier spends, any order. */
  history: SpendEvent[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isSeconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_WINDOW_SECONDS;
}

function isUnixSeconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** True when the limit sets a rolling window (both fields present). */
export function limitHasSpendWindow(limit: SpendLimit): boolean {
  return limit.windowSeconds !== undefined || limit.maxWindowValue !== undefined;
}

/**
 * Throws unless `windowSeconds` and `maxWindowValue` are both set and usable,
 * or both omitted.
 */
export function validateSpendWindow(limit: SpendLimit, label: string): void {
  const hasWindow = limit.windowSeconds !== undefined;
  const hasMax = limit.maxWindowValue !== undefined;
  assert(hasWindow === hasMax, `${label}.windowSeconds and maxWindowValue must be set together`);
  if (!hasWindow) return;
  assert(isSeconds(limit.windowSeconds), `${label}.windowSeconds must be an integer from 1 to ${MAX_WINDOW_SECONDS}`);
  parseDecimalInteger(limit.maxWindowValue!, `${label}.maxWindowValue`);
}

/** Frozen copy of the window fields, or omitted when the limit has none. */
export function freezeSpendWindow(limit: SpendLimit): Pick<SpendLimit, 'windowSeconds' | 'maxWindowValue'> {
  validateSpendWindow(limit, 'limit');
  if (limit.windowSeconds === undefined) return {};
  return { windowSeconds: limit.windowSeconds, maxWindowValue: limit.maxWindowValue };
}

/** Returns an error message when `spend` is malformed, else undefined. */
export function checkSpendActivity(spend: unknown): string | undefined {
  if (!spend || typeof spend !== 'object') return 'spend must be an object';
  const a = spend as SpendActivity;
  if (!isUnixSeconds(a.now)) return 'spend.now must be non-negative integer seconds';
  if (!Array.isArray(a.history)) return 'spend.history must be an array';
  if (a.history.length > MAX_SPEND_EVENTS) {
    return `spend.history must have at most ${MAX_SPEND_EVENTS} events`;
  }
  for (let i = 0; i < a.history.length; i++) {
    const e = a.history[i];
    if (!e || typeof e !== 'object') {
      return `spend.history[${i}] must be { asset, value, at }`;
    }
    if (!isAssetCode(e.asset)) {
      return `spend.history[${i}].asset is not a valid asset code`;
    }
    try {
      parseDecimalInteger(e.value, `spend.history[${i}].value`);
    } catch {
      return `spend.history[${i}].value must be a non-negative decimal integer string`;
    }
    if (!isUnixSeconds(e.at)) {
      return `spend.history[${i}].at must be non-negative integer seconds`;
    }
  }
  return undefined;
}

/**
 * Sum history for `asset` that falls inside the window, plus `value`.
 * Events dated in the future count as recent.
 */
export function windowedSpendTotal(
  history: readonly SpendEvent[],
  asset: string,
  value: string,
  now: number,
  windowSeconds: number
): bigint {
  let total = parseDecimalInteger(value, 'request.value');
  for (const event of history) {
    if (event.asset !== asset) continue;
    if (now - event.at >= windowSeconds) continue;
    total += parseDecimalInteger(event.value, 'spend.value');
  }
  return total;
}

/**
 * Check the matched limit's rolling cap. Returns a denial, or undefined when
 * the limit has no window or the request still fits.
 */
export function checkSpendWindow(
  limit: SpendLimit,
  request: { asset: string; value: string },
  spend: SpendActivity
): DenialReason | undefined {
  if (limit.windowSeconds === undefined || limit.maxWindowValue === undefined) return undefined;
  const total = windowedSpendTotal(
    spend.history,
    request.asset,
    request.value,
    spend.now,
    limit.windowSeconds
  );
  const max = parseDecimalInteger(limit.maxWindowValue, 'limit.maxWindowValue');
  if (total > max) {
    return {
      code: 'window-exceeded',
      message: `window total ${total.toString()} exceeds max ${limit.maxWindowValue} for ${limit.asset} in ${limit.windowSeconds}s`,
    };
  }
  return undefined;
}

/**
 * In-memory record of spends, for feeding `SpendActivity`. Callers record a
 * transfer only after it is allowed.
 */
export class MemorySpendLedger {
  private events: SpendEvent[] = [];

  /** Record one spend at `at` (Unix seconds). */
  record(asset: string, value: string, at: number): void {
    if (!isAssetCode(asset)) throw new Error('spend asset is not a valid asset code');
    parseDecimalInteger(value, 'spend.value');
    if (!isUnixSeconds(at)) throw new Error('spend time must be non-negative integer seconds');
    this.events.push(Object.freeze({ asset, value, at }));
  }

  /** Snapshot for `evaluatePolicy` at time `now`. */
  activity(now: number): SpendActivity {
    return { now, history: this.events.slice() };
  }

  /** Drop events older than `before`; returns how many were removed. */
  prune(before: number): number {
    const kept = this.events.filter((e) => e.at >= before);
    const removed = this.events.length - kept.length;
    this.events = kept;
    return removed;
  }

  get size(): number {
    return this.events.length;
  }
}
