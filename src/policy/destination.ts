import { hexToBytes, normalizeHex } from '../utils/bytes.js';

/** Shortest accepted destination, in bytes (chain-agnostic). */
export const MIN_DESTINATION_BYTES = 1;
/** Longest accepted destination, in bytes. */
export const MAX_DESTINATION_BYTES = 32;
/** Cap on `allowTo` / `denyTo` entries per spend limit. */
export const MAX_DESTINATIONS = 64;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Accept 1..32 byte hex addresses. Leading 0x is allowed; output is lowercase, unprefixed.
 */
export function normalizeDestination(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a hex string`);
  }
  let hex: string;
  try {
    hex = normalizeHex(value);
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'invalid hex';
    throw new Error(`${name}: ${message}`);
  }
  const bytes = hexToBytes(hex);
  assert(
    bytes.length >= MIN_DESTINATION_BYTES && bytes.length <= MAX_DESTINATION_BYTES,
    `${name} must be ${MIN_DESTINATION_BYTES}..${MAX_DESTINATION_BYTES} bytes of hex (got ${bytes.length})`
  );
  return hex;
}

export function isDestinationHex(value: unknown): value is string {
  try {
    normalizeDestination(value, 'address');
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize a destination list: unique, canonical hex, capped length.
 * `label` is used in error messages (`limits[0].allowTo`).
 */
export function freezeDestinationList(list: unknown, label: string): string[] {
  assert(Array.isArray(list), `${label} must be an array`);
  assert(list.length <= MAX_DESTINATIONS, `${label} must have at most ${MAX_DESTINATIONS} entries`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const hex = normalizeDestination(list[i], `${label}[${i}]`);
    assert(!seen.has(hex), `${label}: duplicate destination ${hex}`);
    seen.add(hex);
    out.push(hex);
  }
  return Object.freeze(out) as string[];
}
