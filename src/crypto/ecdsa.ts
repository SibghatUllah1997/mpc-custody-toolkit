import { secp256k1 } from '@noble/curves/secp256k1';
import { InputError } from '../errors/input.js';
import { assertUint8ArrayLength } from '../utils/bytes.js';
import { isValidPrivateKey } from './secp256k1.js';

/** Compact ECDSA signature length (r || s). */
export const SIGNATURE_COMPACT_BYTES = 64;
/** Digest length this wrapper will sign. */
export const MESSAGE_HASH_BYTES = 32;
/** Compressed secp256k1 public key length. */
export const PUBLIC_KEY_COMPRESSED_BYTES = 33;

const SIGN_OPTS = { prehash: false, lowS: true } as const;
const VERIFY_OPTS = { prehash: false, lowS: true } as const;

function assertValidPrivateKey(privateKey: Uint8Array): void {
  if (!isValidPrivateKey(privateKey)) {
    throw new InputError(
      'invalid-range',
      'privateKey must be a 32-byte secp256k1 scalar in (0, n)',
      'privateKey'
    );
  }
}

function assertCompressedPublicKey(publicKey: Uint8Array): void {
  assertUint8ArrayLength('publicKey', publicKey, PUBLIC_KEY_COMPRESSED_BYTES);
  if (!secp256k1.utils.isValidPublicKey(publicKey, true)) {
    throw new InputError('invalid-range', 'publicKey must be a compressed secp256k1 point', 'publicKey');
  }
}

/**
 * Sign a 32-byte digest with a secp256k1 private key.
 * Returns a 64-byte compact (r || s) signature with low-S.
 */
export function signHash(messageHash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  assertUint8ArrayLength('messageHash', messageHash, MESSAGE_HASH_BYTES);
  assertValidPrivateKey(privateKey);
  const sig = secp256k1.sign(messageHash, privateKey, SIGN_OPTS);
  return sig.toBytes('compact');
}

/**
 * Verify a compact signature over a 32-byte digest.
 * Returns false for a mismatch; throws only on malformed argument lengths.
 */
export function verifyHash(
  messageHash: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  assertUint8ArrayLength('messageHash', messageHash, MESSAGE_HASH_BYTES);
  assertUint8ArrayLength('signature', signature, SIGNATURE_COMPACT_BYTES);
  assertCompressedPublicKey(publicKey);
  try {
    return secp256k1.verify(signature, messageHash, publicKey, VERIFY_OPTS);
  } catch {
    return false;
  }
}
