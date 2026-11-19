import { keccak_256 } from '@noble/hashes/sha3';
import { InputError } from '../errors/input.js';

/** Keccak-256 digest length in bytes (Ethereum hashing, not NIST SHA-3). */
export const KECCAK256_BYTES = 32;

/**
 * Keccak-256 of `data`. Used for EIP-191 / EIP-712 message hashing.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  if (!(data instanceof Uint8Array)) {
    throw new InputError('invalid-type', 'data must be a Uint8Array', 'data');
  }
  return keccak_256(data);
}
