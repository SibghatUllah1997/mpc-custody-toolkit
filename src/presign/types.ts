import type { Policy, PolicyDecision, Signer } from '../policy/types.js';
import type { ApprovalActivity } from '../policy/ratelimit.js';
import type { ApprovalItem, QueueStatus } from '../queue/types.js';
import type { CostModel, SimulationResult } from '../sim/types.js';
import type { Transaction } from '../tx/types.js';

export type PreSignStage = 'transaction' | 'approval' | 'policy' | 'simulation';

export type PreSignReason = {
  stage: PreSignStage;
  code: string;
  message: string;
};

export type PreSignInput = {
  tx: Transaction;
  policy: Policy;
  /** Asset ticker the spend limit is checked against. */
  asset: string;
  /** Signer ids that have already approved this request. */
  approvals: string[];
  /** When set, run the mock simulator and attach its result. */
  gasPrice?: string;
  model?: CostModel;
  /** When true, the simulator counts fee toward the matched spend cap. */
  includeFeeInLimit?: boolean;
  /** Recent approvals, required when the policy sets `signerLimits`. */
  activity?: ApprovalActivity;
  /**
   * When set, pre-sign waits for k distinct verified receipts on this item
   * and uses those signer ids as approvals. String `approvals` are ignored.
   */
  queueItem?: ApprovalItem;
};

export type PreSignResult = {
  ok: boolean;
  tx?: Transaction;
  policy?: PolicyDecision;
  simulation?: SimulationResult;
  queue?: QueueStatus;
  reasons: PreSignReason[];
};

/** Convenience re-export so callers can type approvals without importing policy. */
export type PreSignSigner = Signer;
