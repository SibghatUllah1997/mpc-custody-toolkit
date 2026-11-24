import { parseDecimalInteger } from './amount.js';
import { isDestinationHex, normalizeDestination } from './destination.js';
import type {
  DenialReason,
  Policy,
  PolicyDecision,
  SignRequest,
  SpendLimit,
} from './types.js';
import { checkApprovalActivity, checkSignerRate, type ApprovalActivity } from './ratelimit.js';
import { freezePolicy, isAssetCode, isSignerId } from './validate.js';

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
export function evaluatePolicy(
  policy: Policy,
  request: SignRequest,
  activity?: ApprovalActivity
): PolicyDecision {
  const frozen = freezePolicy(policy);
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

  const allowedIds = new Set(frozen.signers.map((s) => s.id));
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
  if (approvalCount < frozen.threshold) {
    return deny(
      'insufficient-approvals',
      `need ${frozen.threshold} approvals, got ${approvalCount}`,
      { approvalCount }
    );
  }

  const rate = frozen.signerLimits;
  if (rate) {
    if (activity === undefined) {
      return deny('activity-required', 'policy has signer rate limits but no approval activity was given', {
        approvalCount,
      });
    }
    const problem = checkApprovalActivity(activity);
    if (problem) return deny('invalid-request', problem, { approvalCount });
    for (const id of seen) {
      const denial = checkSignerRate(rate, id, activity);
      if (denial) return deny(denial.code, denial.message, { approvalCount });
    }
  }

  return checkSpendAgainstPolicy(frozen, request, approvalCount);
}

export type SpendRequest = {
  asset: string;
  value: string;
  to?: string;
};

/**
 * Check only the matched spend cap and destination lists. Signers, threshold,
 * and rate limits are skipped so an offline machine can confirm a transfer
 * against a published policy without replaying approvals.
 */
export function evaluateSpendLimits(policy: Policy, request: SpendRequest): PolicyDecision {
  const frozen = freezePolicy(policy);
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
  return checkSpendAgainstPolicy(frozen, request, 0);
}

function checkSpendAgainstPolicy(
  frozen: Policy,
  request: SpendRequest,
  approvalCount: number
): PolicyDecision {
  const limit = matchingLimit(frozen, request.asset);
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

  const hasAllow = limit.allowTo !== undefined;
  const hasDeny = limit.denyTo !== undefined;
  if (request.to !== undefined) {
    if (!isDestinationHex(request.to)) {
      return deny('invalid-request', 'request.to is not a valid destination address', {
        approvalCount,
        matchedLimit: limit,
      });
    }
  } else if (hasAllow || hasDeny) {
    return deny('destination-required', `asset ${limit.asset} requires a destination address`, {
      approvalCount,
      matchedLimit: limit,
    });
  }

  if (request.to !== undefined && (hasAllow || hasDeny)) {
    const to = normalizeDestination(request.to, 'request.to');
    if (hasDeny && limit.denyTo!.includes(to)) {
      return deny('destination-denied', `destination ${to} is denied for ${limit.asset}`, {
        approvalCount,
        matchedLimit: limit,
      });
    }
    if (hasAllow && !limit.allowTo!.includes(to)) {
      return deny('destination-not-allowed', `destination ${to} is not allowed for ${limit.asset}`, {
        approvalCount,
        matchedLimit: limit,
      });
    }
  }

  return {
    allowed: true,
    reasons: [],
    matchedLimit: limit,
    approvalCount,
  };
}
