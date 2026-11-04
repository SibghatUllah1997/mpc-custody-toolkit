import { parseDecimalInteger } from './amount.js';
import type {
  DenialReason,
  Policy,
  PolicyDecision,
  SignRequest,
  SpendLimit,
} from './types.js';
import { isAssetCode, isSignerId, validatePolicy } from './validate.js';

function deny(code: DenialReason['code'], message: string, extra?: Partial<PolicyDecision>): PolicyDecision {
  return {
    allowed: false,
    reasons: [{ code, message }],
    approvalCount: extra?.approvalCount ?? 0,
    matchedLimit: extra?.matchedLimit,
  };
}

/**
 * Pick the first exact asset match, otherwise the "*" catch-all.
 * Unmatched assets fail closed at the caller.
 */
export function matchingLimit(policy: Policy, asset: string): SpendLimit | undefined {
  const exact = policy.limits.find((l) => l.asset === asset);
  if (exact) return exact;
  return policy.limits.find((l) => l.asset === '*');
}

/**
 * Decide whether `request` may proceed under `policy`.
 * Unknown or duplicate approvals are denied; value is checked against the matched limit.
 */
export function evaluatePolicy(policy: Policy, request: SignRequest): PolicyDecision {
  validatePolicy(policy);
  if (!request || typeof request !== 'object') {
    return deny('invalid-request', 'request must be an object');
  }
  if (!isAssetCode(request.asset)) {
    return deny('invalid-request', 'request.asset is not a valid asset code');
  }
  try {
    parseDecimalInteger(request.value, 'request.value');
  } catch {
    return deny('invalid-request', 'request.value must be a non-negative decimal integer string');
  }
  if (!Array.isArray(request.approvals)) {
    return deny('invalid-request', 'request.approvals must be an array');
  }

  const allowedIds = new Set(policy.signers.map((s) => s.id));
  const seen = new Set<string>();
  for (const id of request.approvals) {
    if (!isSignerId(id) || !allowedIds.has(id)) {
      return deny('unknown-signer', `unknown signer: ${String(id)}`);
    }
    if (seen.has(id)) {
      return deny('duplicate-approval', `duplicate approval from ${id}`);
    }
    seen.add(id);
  }

  const approvalCount = seen.size;
  if (approvalCount < policy.threshold) {
    return deny(
      'insufficient-approvals',
      `need ${policy.threshold} approvals, got ${approvalCount}`,
      { approvalCount }
    );
  }

  const limit = matchingLimit(policy, request.asset);
  if (!limit) {
    return deny('no-matching-limit', `no spend limit covers asset ${request.asset}`, { approvalCount });
  }

  const value = parseDecimalInteger(request.value, 'request.value');
  const max = parseDecimalInteger(limit.maxValue, 'limit.maxValue');
  if (value > max) {
    return deny(
      'limit-exceeded',
      `value ${request.value} exceeds max ${limit.maxValue} for ${limit.asset}`,
      { approvalCount, matchedLimit: limit }
    );
  }

  return {
    allowed: true,
    reasons: [],
    matchedLimit: limit,
    approvalCount,
  };
}
