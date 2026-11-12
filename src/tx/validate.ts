import { InputError, type InputErrorCode } from '../errors/input.js';
import { isDecimalIntegerString } from '../policy/amount.js';
import { hexToBytes, normalizeHex } from '../utils/bytes.js';
import type { Transaction } from './types.js';

/** Shortest accepted address, in bytes (chain-agnostic). */
export const MIN_ADDRESS_BYTES = 1;
/** Longest accepted address, in bytes. */
export const MAX_ADDRESS_BYTES = 32;
/** Longest accepted calldata, in bytes. */
export const MAX_DATA_BYTES = 65536;

function assert(condition: unknown, message: string, code: InputErrorCode = 'invalid-type'): asserts condition {
  if (!condition) throw new InputError(code, message);
}

function parseHexField(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new InputError('invalid-type', `${name} must be a hex string`, name);
  }
  try {
    return normalizeHex(value);
  } catch (err) {
    if (err instanceof InputError) {
      throw new InputError(err.code, `${name}: ${err.message}`, name);
    }
    throw err;
  }
}

/**
 * Accept 1..32 byte hex addresses. Leading 0x is allowed; output is lowercase, unprefixed.
 */
export function normalizeAddress(value: unknown, name: string): string {
  const hex = parseHexField(value, name);
  const bytes = hexToBytes(hex);
  assert(
    bytes.length >= MIN_ADDRESS_BYTES && bytes.length <= MAX_ADDRESS_BYTES,
    `${name} must be ${MIN_ADDRESS_BYTES}..${MAX_ADDRESS_BYTES} bytes of hex (got ${bytes.length})`,
    'invalid-length'
  );
  return hex;
}

/**
 * Accept empty or even-length hex calldata, capped at MAX_DATA_BYTES.
 */
export function normalizeData(value: unknown): string {
  if (value === undefined || value === '') return '';
  const hex = parseHexField(value, 'data');
  const bytes = hexToBytes(hex);
  assert(
    bytes.length <= MAX_DATA_BYTES,
    `data must be at most ${MAX_DATA_BYTES} bytes (got ${bytes.length})`,
    'invalid-length'
  );
  return hex;
}

export function isAddressHex(value: unknown): value is string {
  try {
    normalizeAddress(value, 'address');
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws if required fields are missing or malformed. Does not mutate the input.
 */
export function validateTransaction(tx: Transaction): void {
  freezeTransaction(tx);
}

/** Return a frozen copy with hex fields normalized after validation. */
export function freezeTransaction(tx: Transaction): Transaction {
  assert(tx && typeof tx === 'object' && !Array.isArray(tx), 'transaction must be an object');
  const from = normalizeAddress(tx.from, 'from');
  const to = normalizeAddress(tx.to, 'to');
  if (!isDecimalIntegerString(tx.value)) {
    throw new InputError('invalid-integer', 'value must be a non-negative decimal integer string', 'value');
  }
  const data = normalizeData(tx.data);
  const copy: Transaction = { from, to, value: tx.value, data };
  return Object.freeze(copy);
}
