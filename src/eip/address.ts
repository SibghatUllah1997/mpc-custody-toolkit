import { secp256k1 } from '@noble/curves/secp256k1';
import { PUBLIC_KEY_COMPRESSED_BYTES } from '../crypto/ecdsa.js';
import { InputError } from '../errors/input.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { keccak256 } from './keccak.js';

/** Ethereum address length in bytes (last 20 bytes of keccak-256(pubkey)). */
export const ADDRESS_BYTES = 20;
/** Hex length of an address without the `0x` prefix. */
export const ADDRESS_HEX_LENGTH = ADDRESS_BYTES * 2;

function compressedPublicKey(value: string | Uint8Array, field = 'publicKey'): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : hexToBytes(value, PUBLIC_KEY_COMPRESSED_BYTES);
  if (bytes.length !== PUBLIC_KEY_COMPRESSED_BYTES) {
    throw new InputError(
      'invalid-length',
      `${field} must be a compressed secp256k1 point (${PUBLIC_KEY_COMPRESSED_BYTES} bytes)`,
      field
    );
  }
  if (!secp256k1.utils.isValidPublicKey(bytes, true)) {
    throw new InputError('invalid-range', `${field} must be a compressed secp256k1 point`, field);
  }
  return bytes;
}

/**
 * EIP-55 checksum address: mixed-case hex so a mistyped character fails the
 * keccak nibble check. Input is 20 bytes as hex, with or without `0x`.
 */
export function encodeEip55(hex: string): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', 'address must be a hex string', 'address');
  }
  const raw = normalizeHex(hex);
  if (raw.length !== ADDRESS_HEX_LENGTH) {
    throw new InputError(
      'invalid-length',
      `address must be ${ADDRESS_BYTES} bytes (${ADDRESS_HEX_LENGTH} hex chars)`,
      'address'
    );
  }
  const hashHex = bytesToHex(keccak256(new TextEncoder().encode(raw)));
  let out = '0x';
  for (let i = 0; i < ADDRESS_HEX_LENGTH; i++) {
    const nibble = Number.parseInt(hashHex[i], 16);
    out += nibble >= 8 ? raw[i].toUpperCase() : raw[i];
  }
  return out;
}

/**
 * Ethereum address of a compressed secp256k1 public key: keccak-256 of the
 * uncompressed X||Y bytes (no `04` prefix), last 20 bytes, then EIP-55.
 */
export function publicKeyToAddress(publicKey: string | Uint8Array): string {
  const compressed = compressedPublicKey(publicKey);
  const uncompressed = secp256k1.ProjectivePoint.fromHex(compressed).toRawBytes(false);
  const hash = keccak256(uncompressed.subarray(1));
  return encodeEip55(bytesToHex(hash.subarray(hash.length - ADDRESS_BYTES)));
}
