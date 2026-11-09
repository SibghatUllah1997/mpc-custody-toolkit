import type { Share } from '../sss/shamir.js';

/** Default reconstruction threshold for the toy demo. */
export const DEFAULT_THRESHOLD = 2;
/** Default number of shares issued by the toy demo. */
export const DEFAULT_TOTAL = 3;

/**
 * A split custody key: the public key is known to everyone, and the
 * private scalar exists only as Shamir shares until an offline combine.
 */
export type ThresholdSetup = {
  publicKey: Uint8Array;
  shares: Share[];
  threshold: number;
  total: number;
};

/**
 * Compact signature produced after reconstructing a private key from shares.
 * The reconstructed scalar is not retained on this object.
 */
export type ThresholdSignature = {
  signature: Uint8Array;
  publicKey: Uint8Array;
  digest: Uint8Array;
  usedShareXs: number[];
};
