import { evaluatePolicy } from '../policy/evaluate.js';
import type { PolicyDecision, SignRequest } from '../policy/types.js';
import { freezeTransaction } from '../tx/validate.js';
import type { Transaction } from '../tx/types.js';
import type { PreSignInput, PreSignReason, PreSignResult } from './types.js';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function tryFreezeTransaction(tx: Transaction): { tx: Transaction } | { reason: PreSignReason } {
  try {
    return { tx: freezeTransaction(tx) };
  } catch (err) {
    return {
      reason: {
        stage: 'transaction',
        code: 'invalid-transaction',
        message: errorMessage(err, 'transaction is invalid'),
      },
    };
  }
}

function tryEvaluatePolicy(input: PreSignInput, value: string): PolicyDecision | { reason: PreSignReason } {
  const request: SignRequest = {
    asset: input.asset,
    value,
    approvals: input.approvals,
  };
  try {
    return evaluatePolicy(input.policy, request);
  } catch (err) {
    return {
      reason: {
        stage: 'policy',
        code: 'invalid-policy',
        message: errorMessage(err, 'policy is invalid'),
      },
    };
  }
}

/**
 * Validate a transfer and evaluate custody policy before any signing work.
 * Malformed inputs become reasons instead of thrown errors so callers can
 * present a single decision object. The spend amount is always the frozen
 * transaction value.
 */
export function runPreSign(input: PreSignInput): PreSignResult {
  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      reasons: [{ stage: 'transaction', code: 'invalid-input', message: 'pre-sign input must be an object' }],
    };
  }

  const frozen = tryFreezeTransaction(input.tx);
  if ('reason' in frozen) {
    return { ok: false, reasons: [frozen.reason] };
  }

  const reasons: PreSignReason[] = [];
  const decision = tryEvaluatePolicy(input, frozen.tx.value);
  let policy: PolicyDecision | undefined;
  if ('reason' in decision) {
    reasons.push(decision.reason);
  } else {
    policy = decision;
    for (const r of decision.reasons) {
      reasons.push({ stage: 'policy', code: r.code, message: r.message });
    }
  }

  return {
    ok: reasons.length === 0,
    tx: frozen.tx,
    policy,
    reasons,
  };
}
