/**
 * Hex and bytes utilities with strict validation.
 * - Hex strings may include a 0x prefix.
 * - Hex must be lowercase a-f0-9 after normalization.
 * - Throws on odd-length or non-hex input.
 */

const HEX_REGEX = /^[0-9a-f]*$/;

export function strip0x(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

export function isEvenLengthHex(hex: string): boolean {
  const h = strip0x(hex);
  return h.length % 2 === 0 && HEX_REGEX.test(h);
}

export function normalizeHex(hex: string): string {
  const h = strip0x(hex).toLowerCase();
  if (!HEX_REGEX.test(h)) {
    throw new Error('Invalid hex: contains non-hex characters');
  }
  if (h.length % 2 !== 0) {
    throw new Error('Invalid hex: must have an even number of characters');
  }
  return h;
}

export function bytesToHex(bytes: Uint8Array): string {
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
    throw new Error(`Invalid hex length: expected ${expectedLength} bytes, got ${byteLen}`);
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
    throw new Error(`${name} must be a Uint8Array`);
  }
  if (value.length !== expectedLength) {
    throw new Error(`${name} must be exactly ${expectedLength} bytes`);
  }
}

