/**
 * Watch-only BIP-32 address listing from an xpub. Derives non-hardened
 * children and EIP-55 addresses without ever loading a private key.
 */

import { HDKey } from '@scure/bip32';
import { publicKeyToAddress } from '../eip/address.js';
import { InputError } from '../errors/input.js';
import { bytesToHex } from '../utils/bytes.js';

/** BIP-32 hardened offset; children at or above this cannot be derived from an xpub. */
const HARDENED = 0x80000000;

/** Default number of addresses listed when `count` is omitted. */
export const DEFAULT_WATCH_COUNT = 20;
/** Cap so a caller cannot ask the watch-only lister for an unbounded range. */
export const MAX_WATCH_COUNT = 100;

export type WatchAddress = {
  /** Address index on the selected chain (or directly under the xpub). */
  index: number;
  /** Relative path from the xpub, e.g. `0/5` or `5`. */
  path: string;
  /** 33-byte compressed public key, lowercase hex. */
  publicKey: string;
  /** EIP-55 checksum address of `publicKey`. */
  address: string;
};

export type WatchListOptions = {
  xpub: string;
  /** First address index (inclusive). Defaults to 0. */
  start?: number;
  /** How many addresses to list. Defaults to `DEFAULT_WATCH_COUNT`. */
  count?: number;
  /**
   * BIP-44 change chain under an account xpub: `0` external, `1` change.
   * Omit when the xpub is already a chain node (`m/44'/60'/0'/0`).
   */
  chain?: number;
};

export type WatchAddressList = {
  xpub: string;
  /** First 4 bytes of HASH160 of this node's public key, as 8 hex chars. */
  fingerprint: string;
  start: number;
  count: number;
  chain?: number;
  addresses: WatchAddress[];
};

function fingerprintHex(n: number): string {
  return n.toString(16).padStart(8, '0');
}

function assertIntInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InputError('invalid-integer', `${field} must be an integer`, field);
  }
  if (value < min || value > max) {
    throw new InputError('invalid-range', `${field} must be an integer in ${min}..${max}`, field);
  }
  return value;
}

/**
 * Parse a BIP-32 xpub and refuse anything that carries a private key.
 */
export function parseXpub(xpub: string): HDKey {
  if (typeof xpub !== 'string' || xpub.trim() === '') {
    throw new InputError('missing-value', 'xpub is required', 'xpub');
  }
  const trimmed = xpub.trim();
  if (!trimmed.startsWith('xpub')) {
    throw new InputError('invalid-type', 'watch-only listing accepts xpub keys only', 'xpub');
  }
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(trimmed);
  } catch {
    throw new InputError('invalid-type', 'xpub is not a valid BIP-32 extended public key', 'xpub');
  }
  if (node.privateKey) {
    throw new InputError('invalid-type', 'watch-only listing accepts xpub keys only', 'xpub');
  }
  if (!node.publicKey) {
    throw new InputError('invalid-type', 'xpub did not contain a public key', 'xpub');
  }
  return node;
}

function derivePublicChild(node: HDKey, index: number, field: string): HDKey {
  if (index >= HARDENED) {
    throw new InputError('invalid-range', `${field} must be a non-hardened index below 2^31`, field);
  }
  try {
    const child = node.deriveChild(index);
    if (!child.publicKey) {
      throw new InputError('invalid-range', `cannot derive child ${index} from this xpub`, field);
    }
    return child;
  } catch (err) {
    if (err instanceof InputError) throw err;
    throw new InputError('invalid-range', `cannot derive child ${index} from an xpub`, field);
  }
}

/**
 * List Ethereum addresses under an xpub without the corresponding secret.
 * Account xpubs pass `chain` (0 or 1); chain xpubs omit it and index directly.
 */
export function listWatchAddresses(opts: WatchListOptions): WatchAddressList {
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new InputError('invalid-type', 'watch list options must be an object', 'xpub');
  }
  const root = parseXpub(opts.xpub);
  const start = opts.start === undefined ? 0 : assertIntInRange(opts.start, 'start', 0, HARDENED - 1);
  const count =
    opts.count === undefined ? DEFAULT_WATCH_COUNT : assertIntInRange(opts.count, 'count', 1, MAX_WATCH_COUNT);
  if (start + count > HARDENED) {
    throw new InputError('invalid-range', 'address index must stay below 2^31', 'start');
  }

  let chain: number | undefined;
  let base = root;
  if (opts.chain !== undefined) {
    chain = assertIntInRange(opts.chain, 'chain', 0, 1);
    base = derivePublicChild(root, chain, 'chain');
  }

  const addresses: WatchAddress[] = [];
  for (let i = 0; i < count; i++) {
    const index = start + i;
    const child = derivePublicChild(base, index, 'index');
    const publicKey = bytesToHex(child.publicKey!);
    addresses.push({
      index,
      path: chain === undefined ? `${index}` : `${chain}/${index}`,
      publicKey,
      address: publicKeyToAddress(publicKey),
    });
  }

  const out: WatchAddressList = {
    xpub: root.publicExtendedKey,
    fingerprint: fingerprintHex(root.fingerprint),
    start,
    count,
    addresses,
  };
  if (chain !== undefined) out.chain = chain;
  return out;
}
