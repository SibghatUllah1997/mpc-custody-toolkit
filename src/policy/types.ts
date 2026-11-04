/**
 * Tiny custody policy: who may approve, how many must agree, and per-asset caps.
 * Values are decimal integer strings so JSON round-trips stay exact.
 */

/** Policy id: lowercase letter, then letters, digits, or hyphens (max 64). */
export type PolicyId = string;

export type Signer = {
  id: string;
  label?: string;
};

export type SpendLimit = {
  /** Ticker such as ETH, or "*" as a catch-all. */
  asset: string;
  /** Inclusive per-request ceiling as a non-negative decimal integer string. */
  maxValue: string;
};

export type Policy = {
  id: PolicyId;
  name: string;
  signers: Signer[];
  /** Distinct listed signers required to approve a request. */
  threshold: number;
  limits: SpendLimit[];
};

export type SignRequest = {
  asset: string;
  /** Non-negative decimal integer string. */
  value: string;
  /** Signer ids that have approved this request. */
  approvals: string[];
};

export type DenialCode =
  | 'unknown-signer'
  | 'duplicate-approval'
  | 'insufficient-approvals'
  | 'limit-exceeded'
  | 'no-matching-limit'
  | 'invalid-request';

export type DenialReason = {
  code: DenialCode;
  message: string;
};

export type PolicyDecision = {
  allowed: boolean;
  reasons: DenialReason[];
  matchedLimit?: SpendLimit;
  approvalCount: number;
};
