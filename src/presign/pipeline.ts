import { evaluatePolicy, matchingLimit } from '../policy/evaluate.js';
import type { PolicyDecision, SignRequest, SpendLimit } from '../policy/types.js';
import { simulateTransaction } from '../sim/simulate.js';
import type { SimulationResult } from '../sim/types.js';
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

function trySimulate(
  tx: Transaction,
  input: PreSignInput,
  gasPrice: string,
  matchedLimit?: SpendLimit
): SimulationResult | { reason: PreSignReason } {
  try {
    return simulateTransaction(tx, {
      gasPrice,
      model: input.model,
      limit: matchedLimit,
      includeFeeInLimit: input.includeFeeInLimit,
    });
  } catch (err) {
    return {
      reason: {
        stage: 'simulation',
        code: 'invalid-simulation',
        message: errorMessage(err, 'simulation failed'),
      },
    };
  }
}

function simulationReasons(report: SimulationResult, includeFeeInLimit: boolean | undefined): PreSignReason[] {
  if (!includeFeeInLimit || !report.limit || report.limit.withinLimit) return [];
  return [
    {
      stage: 'simulation',
      code: 'fee-limit-exceeded',
      message: `value plus fee ${report.limit.counted} exceeds max ${report.limit.maxValue} for ${report.limit.asset}`,
    },
  ];
}

/**
 * Validate a transfer, evaluate custody policy, and optionally run the mock
 * simulator before any signing work. Independent failures are collected
 * together; a malformed transaction still short-circuits the later stages.
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

  let simulation: SimulationResult | undefined;
  if (input.gasPrice !== undefined) {
    const matchedLimit = policy?.matchedLimit ?? matchingLimit(input.policy, input.asset);
    const simulated = trySimulate(frozen.tx, input, input.gasPrice, matchedLimit);
    if ('reason' in simulated) {
      reasons.push(simulated.reason);
    } else {
      simulation = simulated;
      reasons.push(...simulationReasons(simulated, input.includeFeeInLimit));
    }
  }

  return {
    ok: reasons.length === 0,
    tx: frozen.tx,
    policy,
    simulation,
    reasons,
  };
}
