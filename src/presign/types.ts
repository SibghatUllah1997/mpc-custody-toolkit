import type { Policy, PolicyDecision, Signer } from '../policy/types.js';
import type { Transaction } from '../tx/types.js';

export type PreSignStage = 'transaction' | 'policy';

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
};

export type PreSignResult = {
  ok: boolean;
  tx?: Transaction;
  policy?: PolicyDecision;
  reasons: PreSignReason[];
};

/** Convenience re-export so callers can type approvals without importing policy. */
export type PreSignSigner = Signer;
