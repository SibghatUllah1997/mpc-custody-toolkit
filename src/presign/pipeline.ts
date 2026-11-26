import { evaluatePolicy, matchingLimit } from '../policy/evaluate.js';
import type { PolicyDecision, SignRequest, SpendLimit } from '../policy/types.js';
import { inspectApprovalItem } from '../queue/item.js';
import type { QueueStatus } from '../queue/types.js';
import { simulateTransaction } from '../sim/simulate.js';
import type { SimulationResult } from '../sim/types.js';
import { transactionDigest } from '../tx/digest.js';
import { freezeTransaction } from '../tx/validate.js';
import type { Transaction } from '../tx/types.js';
import { bytesToHex } from '../utils/bytes.js';
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

function tryEvaluatePolicy(
  input: PreSignInput,
  value: string,
  to: string
): PolicyDecision | { reason: PreSignReason } {
  const request: SignRequest = {
    asset: input.asset,
    value,
    approvals: input.approvals,
    to,
  };
  try {
    return evaluatePolicy(input.policy, request, input.activity, input.spend);
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

function tryQueue(
  input: PreSignInput,
  tx: Transaction
): { approvals: string[]; queue?: QueueStatus } | { reason: PreSignReason; queue?: QueueStatus } {
  const item = input.queueItem;
  if (item === undefined) {
    return { approvals: input.approvals };
  }
  try {
    const digest = bytesToHex(transactionDigest(tx));
    if (item.data.digest !== digest) {
      return {
        reason: {
          stage: 'approval',
          code: 'digest-mismatch',
          message: 'approval item digest does not match the transaction',
        },
      };
    }
    if (item.data.tx !== undefined) {
      const same =
        item.data.tx.from === tx.from &&
        item.data.tx.to === tx.to &&
        item.data.tx.value === tx.value &&
        item.data.tx.data === tx.data;
      if (!same) {
        return {
          reason: {
            stage: 'approval',
            code: 'transaction-mismatch',
            message: 'approval item transaction does not match the pre-sign transfer',
          },
        };
      }
    }
    const queue = inspectApprovalItem(item, input.now ?? new Date());
    if (!queue.ready) {
      const first = queue.reasons[0];
      return {
        reason: {
          stage: 'approval',
          code: first?.code ?? 'insufficient-receipts',
          message: first?.message ?? `need ${queue.threshold} receipts, got ${queue.receiptCount}`,
        },
        queue,
      };
    }
    return { approvals: queue.signerIds, queue };
  } catch (err) {
    return {
      reason: {
        stage: 'approval',
        code: 'invalid-queue',
        message: errorMessage(err, 'approval item is invalid'),
      },
    };
  }
}

/**
 * Validate a transfer, wait for k verified approver receipts when a queue
 * item is attached, evaluate custody policy, and optionally run the mock
 * simulator before any signing work. Independent failures are collected
 * together; a malformed transaction or a queue that is not ready still
 * short-circuits the later stages.
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
  const queued = tryQueue(input, frozen.tx);
  if ('reason' in queued) {
    reasons.push(queued.reason);
    return { ok: false, tx: frozen.tx, queue: queued.queue, reasons };
  }
  const approvals = queued.approvals;
  const queue = queued.queue;

  const decision = tryEvaluatePolicy({ ...input, approvals }, frozen.tx.value, frozen.tx.to);
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
    queue,
    reasons,
  };
}
