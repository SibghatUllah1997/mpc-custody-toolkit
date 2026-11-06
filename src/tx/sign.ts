import { signHash, verifyHash } from '../crypto/ecdsa.js';
import { transactionDigest } from './digest.js';
import type { Transaction } from './types.js';

/**
 * Sign the canonical SHA-256 digest of `tx` with a secp256k1 private key.
 * The transaction is validated first; the digest is 32 bytes.
 */
export function signTransaction(tx: Transaction, privateKey: Uint8Array): Uint8Array {
  return signHash(transactionDigest(tx), privateKey);
}

/**
 * Verify a compact signature over the canonical digest of `tx`.
 */
export function verifyTransaction(
  tx: Transaction,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return verifyHash(transactionDigest(tx), signature, publicKey);
}
