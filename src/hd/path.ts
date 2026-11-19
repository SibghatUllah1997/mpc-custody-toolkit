import { InputError } from '../errors/input.js';

/** BIP-44 Ethereum account 0, external chain, first address. */
export const DEFAULT_PATH = "m/44'/60'/0'/0/0";

const HARDENED = 0x80000000;
const MAX_DEPTH = 255;
const SEGMENT = /^(0|[1-9]\d*)(['hH]?)$/;

/**
 * Parse a BIP-32 path into child indexes (hardened ones offset by 2^31) and
 * return it in canonical form with `'` for hardened steps.
 */
export function parsePath(path: string): { indexes: number[]; canonical: string } {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new InputError('missing-value', 'derivation path is required', 'path');
  }
  const parts = path.trim().split('/');
  if (parts[0] !== 'm') {
    throw new InputError('invalid-type', 'derivation path must start with "m"', 'path');
  }
  const segments = parts.slice(1);
  if (segments.length > MAX_DEPTH) {
    throw new InputError('invalid-range', `derivation path is deeper than ${MAX_DEPTH}`, 'path');
  }
  const indexes: number[] = [];
  const canonical: string[] = ['m'];
  for (const seg of segments) {
    const m = SEGMENT.exec(seg);
    if (!m) {
      throw new InputError('invalid-integer', `invalid path segment "${seg}"`, 'path');
    }
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n >= HARDENED) {
      throw new InputError('invalid-range', `path index ${m[1]} must be below 2^31`, 'path');
    }
    const hardened = m[2] !== '';
    indexes.push(hardened ? n + HARDENED : n);
    canonical.push(hardened ? `${n}'` : `${n}`);
  }
  return { indexes, canonical: canonical.join('/') };
}
