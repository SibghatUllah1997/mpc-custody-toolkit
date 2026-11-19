import { InputError } from '../errors/input.js';
import { hexToBytes } from '../utils/bytes.js';
import { keccak256 } from './keccak.js';

/**
 * EIP-191 version `0x45` (`E`) personal-sign prefix, without the decimal
 * length. The framed payload is this string, the UTF-8 decimal byte length,
 * then the raw message bytes.
 */
export const PERSONAL_MESSAGE_PREFIX = '\x19Ethereum Signed Message:\n';

/** Largest personal message this helper will hash. */
export const MAX_PERSONAL_MESSAGE_BYTES = 65536;

export type PersonalMessageSource =
  | { bytes: Uint8Array; text?: never; hex?: never }
  | { text: string; bytes?: never; hex?: never }
  | { hex: string; bytes?: never; text?: never };

function assertMessageBytes(message: Uint8Array, field: string): void {
  if (!(message instanceof Uint8Array)) {
    throw new InputError('invalid-type', `${field} must be a Uint8Array`, field);
  }
  if (message.length > MAX_PERSONAL_MESSAGE_BYTES) {
    throw new InputError(
      'invalid-length',
      `${field} must be at most ${MAX_PERSONAL_MESSAGE_BYTES} bytes (got ${message.length})`,
      field
    );
  }
}

/**
 * UTF-8 prefix `\\x19Ethereum Signed Message:\\n` plus the decimal length.
 */
export function personalMessagePrefix(byteLength: number): Uint8Array {
  if (!Number.isInteger(byteLength) || byteLength < 0) {
    throw new InputError('invalid-integer', 'byteLength must be a non-negative integer', 'byteLength');
  }
  if (byteLength > MAX_PERSONAL_MESSAGE_BYTES) {
    throw new InputError(
      'invalid-length',
      `byteLength must be at most ${MAX_PERSONAL_MESSAGE_BYTES} (got ${byteLength})`,
      'byteLength'
    );
  }
  return new TextEncoder().encode(`${PERSONAL_MESSAGE_PREFIX}${byteLength}`);
}

/**
 * Concatenate the EIP-191 personal-sign prefix with `message`.
 */
export function framePersonalMessage(message: Uint8Array): Uint8Array {
  assertMessageBytes(message, 'message');
  const prefix = personalMessagePrefix(message.length);
  const framed = new Uint8Array(prefix.length + message.length);
  framed.set(prefix, 0);
  framed.set(message, prefix.length);
  return framed;
}

/**
 * Keccak-256 of an EIP-191 personal message (`personal_sign`).
 */
export function hashPersonalMessage(message: Uint8Array): Uint8Array {
  return keccak256(framePersonalMessage(message));
}

/** Hash a UTF-8 string the way wallets hash `personal_sign` text. */
export function hashPersonalMessageText(text: string): Uint8Array {
  if (typeof text !== 'string') {
    throw new InputError('invalid-type', 'text must be a string', 'text');
  }
  return hashPersonalMessage(new TextEncoder().encode(text));
}

/** Hash raw bytes given as even-length hex (optional `0x`). */
export function hashPersonalMessageHex(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', 'hex must be a hex string', 'hex');
  }
  return hashPersonalMessage(hexToBytes(hex));
}

function sourceKeys(source: object): string[] {
  return ['bytes', 'text', 'hex'].filter((k) => (source as Record<string, unknown>)[k] !== undefined);
}

/**
 * Resolve text, hex, or raw bytes into the payload wallets hash.
 */
export function resolvePersonalMessage(source: PersonalMessageSource): Uint8Array {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new InputError('invalid-type', 'personal message source must be an object', 'source');
  }
  const keys = sourceKeys(source);
  if (keys.length !== 1) {
    throw new InputError(
      'invalid-type',
      'personal message source must set exactly one of bytes, text, or hex',
      'source'
    );
  }
  if ('bytes' in source && source.bytes !== undefined) {
    assertMessageBytes(source.bytes, 'bytes');
    return source.bytes;
  }
  if ('text' in source && source.text !== undefined) {
    if (typeof source.text !== 'string') {
      throw new InputError('invalid-type', 'text must be a string', 'text');
    }
    const bytes = new TextEncoder().encode(source.text);
    assertMessageBytes(bytes, 'text');
    return bytes;
  }
  if ('hex' in source && source.hex !== undefined) {
    if (typeof source.hex !== 'string') {
      throw new InputError('invalid-type', 'hex must be a hex string', 'hex');
    }
    const bytes = hexToBytes(source.hex);
    assertMessageBytes(bytes, 'hex');
    return bytes;
  }
  throw new InputError('missing-value', 'personal message source is empty', 'source');
}

/** Hash a personal-sign payload from text, hex, or bytes. */
export function hashPersonalMessageSource(source: PersonalMessageSource): Uint8Array {
  return hashPersonalMessage(resolvePersonalMessage(source));
}
