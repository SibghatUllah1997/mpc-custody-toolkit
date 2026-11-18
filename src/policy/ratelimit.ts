/**
 * Per-signer cooldown and rate limit. The policy says how often any one
 * signer may approve; the caller supplies that signer's recent approvals as
 * an `ApprovalActivity` so evaluation stays a pure function of its inputs.
 *
 * Times are whole Unix seconds. Events dated in the future (clock skew, a
 * bad import) still count as recent, so skew can only make the check stricter.
 */
import type { SignerRateLimit } from './types.js';

/** Longest cooldown or window accepted: 30 days. */
export const MAX_RATE_SECONDS = 30 * 24 * 60 * 60;
/** Highest `maxApprovals` per window. */
export const MAX_APPROVALS_PER_WINDOW = 1000;
/** Cap on history events passed to one evaluation. */
export const MAX_ACTIVITY_EVENTS = 10_000;

export type ApprovalEvent = {
  signer: string;
  /** Unix seconds when the signer approved. */
  at: number;
};

export type ApprovalActivity = {
  /** Current Unix time in seconds. */
  now: number;
  /** Earlier approvals, any order. */
  history: ApprovalEvent[];
};

export type RateDenial = {
  code: 'signer-cooldown' | 'signer-rate-limited';
  message: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isSeconds(value: unknown, min: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= MAX_RATE_SECONDS;
}

function isUnixSeconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Throws unless `limit` is a usable signer rate limit. */
export function validateSignerRateLimit(limit: unknown, label = 'policy.signerLimits'): void {
  assert(limit && typeof limit === 'object' && !Array.isArray(limit), `${label} must be an object`);
  const l = limit as SignerRateLimit;
  const hasCooldown = l.cooldownSeconds !== undefined;
  const hasMax = l.maxApprovals !== undefined;
  const hasWindow = l.windowSeconds !== undefined;
  assert(hasCooldown || hasMax || hasWindow, `${label} must set cooldownSeconds or maxApprovals/windowSeconds`);
  if (hasCooldown) {
    assert(isSeconds(l.cooldownSeconds, 1), `${label}.cooldownSeconds must be an integer from 1 to ${MAX_RATE_SECONDS}`);
  }
  assert(hasMax === hasWindow, `${label}.maxApprovals and windowSeconds must be set together`);
  if (hasMax) {
    assert(
      Number.isInteger(l.maxApprovals) && l.maxApprovals! >= 1 && l.maxApprovals! <= MAX_APPROVALS_PER_WINDOW,
      `${label}.maxApprovals must be an integer from 1 to ${MAX_APPROVALS_PER_WINDOW}`
    );
    assert(isSeconds(l.windowSeconds, 1), `${label}.windowSeconds must be an integer from 1 to ${MAX_RATE_SECONDS}`);
  }
}

/** Frozen copy with only the known fields. */
export function freezeSignerRateLimit(limit: SignerRateLimit): SignerRateLimit {
  validateSignerRateLimit(limit);
  const out: SignerRateLimit = {};
  if (limit.cooldownSeconds !== undefined) out.cooldownSeconds = limit.cooldownSeconds;
  if (limit.maxApprovals !== undefined) {
    out.maxApprovals = limit.maxApprovals;
    out.windowSeconds = limit.windowSeconds;
  }
  return Object.freeze(out);
}

/** Returns an error message when `activity` is malformed, else undefined. */
export function checkApprovalActivity(activity: unknown): string | undefined {
  if (!activity || typeof activity !== 'object') return 'activity must be an object';
  const a = activity as ApprovalActivity;
  if (!isUnixSeconds(a.now)) return 'activity.now must be non-negative integer seconds';
  if (!Array.isArray(a.history)) return 'activity.history must be an array';
  if (a.history.length > MAX_ACTIVITY_EVENTS) return `activity.history must have at most ${MAX_ACTIVITY_EVENTS} events`;
  for (let i = 0; i < a.history.length; i++) {
    const e = a.history[i];
    if (!e || typeof e !== 'object' || typeof e.signer !== 'string' || !isUnixSeconds(e.at)) {
      return `activity.history[${i}] must be { signer, at } with integer seconds`;
    }
  }
  return undefined;
}

/**
 * Check one signer against the limit. Cooldown is reported first since it
 * tells the operator exactly when the signer may approve again.
 */
export function checkSignerRate(
  limit: SignerRateLimit,
  signer: string,
  activity: ApprovalActivity
): RateDenial | undefined {
  const times = activity.history.filter((e) => e.signer === signer).map((e) => e.at);
  if (limit.cooldownSeconds !== undefined && times.length > 0) {
    const last = Math.max(...times);
    const since = activity.now - last;
    if (since < limit.cooldownSeconds) {
      const wait = limit.cooldownSeconds - Math.max(since, 0);
      return {
        code: 'signer-cooldown',
        message: `signer ${signer} is in cooldown for another ${wait}s`,
      };
    }
  }
  if (limit.maxApprovals !== undefined && limit.windowSeconds !== undefined) {
    const recent = times.filter((at) => activity.now - at < limit.windowSeconds!).length;
    if (recent >= limit.maxApprovals) {
      return {
        code: 'signer-rate-limited',
        message: `signer ${signer} already approved ${recent} times in the last ${limit.windowSeconds}s (max ${limit.maxApprovals})`,
      };
    }
  }
  return undefined;
}

/**
 * Small in-memory record of who approved when, for feeding `ApprovalActivity`.
 * Callers record a request's approvers only after it is allowed.
 */
export class MemoryApprovalLedger {
  private events: ApprovalEvent[] = [];

  /** Record that each signer approved at `at` (Unix seconds). */
  record(signers: readonly string[], at: number): void {
    if (!isUnixSeconds(at)) throw new Error('approval time must be non-negative integer seconds');
    if (!Array.isArray(signers)) throw new Error('signers must be an array');
    for (const signer of signers) {
      if (typeof signer !== 'string' || signer.length === 0) throw new Error('signer id must be a non-empty string');
      this.events.push(Object.freeze({ signer, at }));
    }
  }

  /** Snapshot for `evaluatePolicy` at time `now`. */
  activity(now: number): ApprovalActivity {
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
