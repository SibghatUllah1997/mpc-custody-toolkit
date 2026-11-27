import type { Transaction } from '../tx/types.js';

/** What the offline signer is asked to sign. */
export type AirgapRequestKind = 'transaction' | 'digest';

/**
 * Unsigned request carried to the offline machine. `digest` is always the
 * exact 32 bytes that get signed; for a transaction it is recomputed from
 * `tx` on every decode, so the two can never disagree.
 */
export type AirgapSignRequest = {
  id: string;
  kind: AirgapRequestKind;
  digest: string;
  publicKey: string;
  tx?: Transaction;
  asset?: string;
  note?: string;
  /** UTC instant after which sign and verify must refuse this request. */
  expiresAt?: string;
  /** SHA-256 digest of the policy snapshot this request is bound to. */
  policyDigest?: string;
};

/** Signature carried back from the offline machine. */
export type AirgapSignResponse = {
  requestId: string;
  digest: string;
  publicKey: string;
  signature: string;
};

export type AirgapRequestInput = {
  publicKeyHex: string;
  tx?: Transaction;
  digestHex?: string;
  asset?: string;
  note?: string;
  /** 16 hex chars; random when omitted. */
  id?: string;
  /** UTC instant; omitted requests never expire on their own. */
  expiresAt?: string;
  /** 32-byte hex; omitted requests are not bound to a snapshot. */
  policyDigest?: string;
};

export type AirgapVerifyCode =
  | 'expired'
  | 'request-id-mismatch'
  | 'digest-mismatch'
  | 'public-key-mismatch'
  | 'bad-signature';

/** Optional clock so tests can freeze "now" without waiting. */
export type AirgapClock = {
  now?: Date;
};

export type AirgapVerifyReport = {
  ok: boolean;
  requestId: string;
  digest: string;
  publicKey: string;
  codes: AirgapVerifyCode[];
};
