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
  /** When set, `to` must be one of these canonical hex addresses. */
  allowTo?: string[];
  /** When set, `to` must not be any of these canonical hex addresses. */
  denyTo?: string[];
  /**
   * Sliding window, in whole seconds, over which `maxWindowValue` is the
   * inclusive cap on the sum of this asset's recent spends plus the request.
   * Must be set together with `maxWindowValue`.
   */
  windowSeconds?: number;
  /** Inclusive rolling cap; requires `windowSeconds`. */
  maxWindowValue?: string;
};

/** How often any one signer may approve. Times are whole seconds. */
export type SignerRateLimit = {
  /** Minimum gap between two approvals by the same signer. */
  cooldownSeconds?: number;
  /** At most this many approvals per signer inside `windowSeconds`. */
  maxApprovals?: number;
  windowSeconds?: number;
};

export type Policy = {
  id: PolicyId;
  name: string;
  signers: Signer[];
  /** Distinct listed signers required to approve a request. */
  threshold: number;
  limits: SpendLimit[];
  /** Optional per-signer cooldown and rate limit; needs approval activity at evaluation. */
  signerLimits?: SignerRateLimit;
};

export type SignRequest = {
  asset: string;
  /** Non-negative decimal integer string. */
  value: string;
  /** Signer ids that have approved this request. */
  approvals: string[];
  /** Optional destination address (lowercase hex, no 0x) checked against the matched limit. */
  to?: string;
};

export type DenialCode =
  | 'unknown-signer'
  | 'duplicate-approval'
  | 'insufficient-approvals'
  | 'limit-exceeded'
  | 'no-matching-limit'
  | 'invalid-request'
  | 'destination-required'
  | 'destination-denied'
  | 'destination-not-allowed'
  | 'activity-required'
  | 'signer-cooldown'
  | 'signer-rate-limited'
  | 'spend-history-required'
  | 'window-exceeded';

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
