import { signHash, verifyHash } from '../crypto/ecdsa.js';
import { generateKeyPair, getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { combineShares, splitSecret, type Share } from '../sss/shamir.js';
import { signTransaction, verifyTransaction } from '../tx/sign.js';
import { transactionDigest } from '../tx/digest.js';
import type { Transaction } from '../tx/types.js';
import { bytesToHex } from '../utils/bytes.js';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_TOTAL,
  type ThresholdSetup,
  type ThresholdSignature,
} from './types.js';

function wipeBytes(bytes: Uint8Array): void {
  bytes.fill(0);
}

function sortedShareXs(shares: Share[]): number[] {
  return shares.map((s) => s.x).sort((a, b) => a - b);
}

function assertExpectedPublicKey(derived: Uint8Array, expected?: Uint8Array): void {
  if (!expected) return;
  if (bytesToHex(derived) !== bytesToHex(expected)) {
    throw new Error('reconstructed key does not match the expected public key');
  }
}

/**
 * Mint a fresh secp256k1 key and split the private scalar into k-of-n shares.
 * The private key never leaves this function; callers keep shares plus the public key.
 */
export function setupThresholdKey(opts?: { threshold?: number; total?: number }): ThresholdSetup {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const total = opts?.total ?? DEFAULT_TOTAL;
  const { privateKey, publicKey } = generateKeyPair();
  try {
    const shares = splitSecret(privateKey, threshold, total);
    return { publicKey, shares, threshold, total };
  } finally {
    wipeBytes(privateKey);
  }
}

/**
 * Combine `shares` offline, sign `digest`, then wipe the reconstructed scalar.
 * Pass `expectedPublicKey` (from setup) so a mismatched subset fails closed.
 */
export function signWithShares(
  shares: Share[],
  digest: Uint8Array,
  expectedPublicKey?: Uint8Array
): ThresholdSignature {
  const privateKey = combineShares(shares);
  try {
    const derived = getPublicKeyCompressed(privateKey);
    assertExpectedPublicKey(derived, expectedPublicKey);
    const signature = signHash(digest, privateKey);
    return {
      signature,
      publicKey: derived,
      digest,
      usedShareXs: sortedShareXs(shares),
    };
  } finally {
    wipeBytes(privateKey);
  }
}

/**
 * Same offline combine as `signWithShares`, but over the canonical transaction digest.
 */
export function signTransactionWithShares(
  shares: Share[],
  tx: Transaction,
  expectedPublicKey?: Uint8Array
): ThresholdSignature {
  const digest = transactionDigest(tx);
  const privateKey = combineShares(shares);
  try {
    const derived = getPublicKeyCompressed(privateKey);
    assertExpectedPublicKey(derived, expectedPublicKey);
    const signature = signTransaction(tx, privateKey);
    return {
      signature,
      publicKey: derived,
      digest,
      usedShareXs: sortedShareXs(shares),
    };
  } finally {
    wipeBytes(privateKey);
  }
}

/** Verify a compact signature against the public key recorded on the result. */
export function verifyThresholdSignature(result: ThresholdSignature): boolean {
  return verifyHash(result.digest, result.signature, result.publicKey);
}

/** Verify a compact signature over a transaction using the result's public key. */
export function verifyThresholdTransaction(
  tx: Transaction,
  result: ThresholdSignature
): boolean {
  return verifyTransaction(tx, result.signature, result.publicKey);
}
