/**
 * Hex and bytes utilities with strict validation.
 * - Hex strings may include a 0x prefix.
 * - Hex must be lowercase a-f0-9 after normalization.
 * - Throws on odd-length or non-hex input.
 */

import { InputError } from '../errors/input.js';

const HEX_REGEX = /^[0-9a-f]*$/;

function requireHexString(hex: unknown, name: string): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', `${name} must be a hex string`, name);
  }
  return hex;
}

export function strip0x(hex: string): string {
  const h = requireHexString(hex, 'hex');
  return h.startsWith('0x') || h.startsWith('0X') ? h.slice(2) : h;
}

export function isEvenLengthHex(hex: string): boolean {
  if (typeof hex !== 'string') return false;
  const h = strip0x(hex);
  return h.length % 2 === 0 && HEX_REGEX.test(h);
}

export function normalizeHex(hex: string): string {
  const h = strip0x(hex).toLowerCase();
  if (!HEX_REGEX.test(h)) {
    throw new InputError('invalid-hex', 'Invalid hex: contains non-hex characters', 'hex');
  }
  if (h.length % 2 !== 0) {
    throw new InputError('invalid-hex', 'Invalid hex: must have an even number of characters', 'hex');
  }
  return h;
}

export function bytesToHex(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new InputError('invalid-type', 'bytes must be a Uint8Array', 'bytes');
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += (b >>> 4).toString(16);
    out += (b & 0x0f).toString(16);
  }
  return out;
}

export function hexToBytes(hex: string, expectedLength?: number): Uint8Array {
  const h = normalizeHex(hex);
  const byteLen = h.length / 2;
  if (expectedLength !== undefined && byteLen !== expectedLength) {
    throw new InputError(
      'invalid-length',
      `Invalid hex length: expected ${expectedLength} bytes, got ${byteLen}`,
      'hex'
    );
  }
  const out = new Uint8Array(byteLen);
  for (let i = 0, j = 0; i < h.length; i += 2, j++) {
    const byte = Number.parseInt(h.slice(i, i + 2), 16);
    // parseInt on validated hex always yields a number 0..255
    out[j] = byte;
  }
  return out;
}

export function assertUint8ArrayLength(name: string, value: Uint8Array, expectedLength: number): void {
  if (!(value instanceof Uint8Array)) {
    throw new InputError('invalid-type', `${name} must be a Uint8Array`, name);
  }
  if (value.length !== expectedLength) {
    throw new InputError('invalid-length', `${name} must be exactly ${expectedLength} bytes`, name);
  }
}
