import { getPublicKeyCompressed, generatePrivateKey, isValidPrivateKey } from '../crypto/secp256k1.js';
import { InputError } from '../errors/input.js';
import { combineShares, MAX_TOTAL_SHARES, MIN_THRESHOLD, splitSecret, type Share } from '../sss/shamir.js';
import { bytesToHex } from '../utils/bytes.js';

export const DEFAULT_THRESHOLD = MIN_THRESHOLD;
export const DEFAULT_TOTAL = 3;

export type FoundationRoundtripInput = {
  /** Reconstruction threshold k. Defaults to 2. */
  threshold?: number;
  /** Number of shares n. Defaults to 3. */
  total?: number;
  /** Share indexes to combine. Defaults to 1..threshold. */
  shareXs?: number[];
  /** Optional 32-byte secret; a fresh key is generated when omitted. */
  secret?: Uint8Array;
};

export type FoundationRoundtripResult = {
  threshold: number;
  total: number;
  usedShareXs: number[];
  privateKey: string;
  publicKey: string;
  recoveredPrivateKey: string;
  recoveredPublicKey: string;
  match: boolean;
};

/** Public fields only — CLI and logs should not print reconstructed scalars. */
export type FoundationCheckReport = {
  ok: boolean;
  threshold: number;
  total: number;
  usedShareXs: number[];
  publicKey: string;
  recoveredPublicKey: string;
};

function resolveShareXs(threshold: number, total: number, shareXs?: number[]): number[] {
  if (shareXs === undefined) {
    return Array.from({ length: threshold }, (_, i) => i + 1);
  }
  if (!Array.isArray(shareXs)) {
    throw new InputError('invalid-type', 'shareXs must be an array of positive integers', 'shareXs');
  }
  if (shareXs.length < threshold) {
    throw new InputError(
      'too-few',
      `shareXs must list at least ${threshold} indexes for a ${threshold}-of-${total} split`,
      'shareXs'
    );
  }
  const seen = new Set<number>();
  const xs: number[] = [];
  for (const x of shareXs) {
    if (!Number.isInteger(x) || x < 1 || x > total) {
      throw new InputError(
        'invalid-range',
        `shareXs values must be integers in 1..${total}`,
        'shareXs'
      );
    }
    if (seen.has(x)) {
      throw new InputError('duplicate', `shareXs: duplicate index ${x}`, 'shareXs');
    }
    seen.add(x);
    xs.push(x);
  }
  return xs;
}

function pickShares(shares: Share[], xs: number[]): Share[] {
  const byX = new Map(shares.map((s) => [s.x, s]));
  return xs.map((x) => {
    const share = byX.get(x);
    if (!share) {
      throw new InputError('invalid-range', `share x=${x} was not issued`, 'shareXs');
    }
    return share;
  });
}

function resolveSecret(secret: Uint8Array | undefined): Uint8Array {
  if (secret === undefined) return generatePrivateKey();
  if (!isValidPrivateKey(secret)) {
    throw new InputError(
      'invalid-range',
      'secret must be a 32-byte secp256k1 scalar in (0, n)',
      'secret'
    );
  }
  return secret;
}

/**
 * Keygen, split, and combine in one pass. `match` is true only when the
 * recovered scalar and compressed public key equal the originals.
 */
export function runFoundationRoundtrip(input: FoundationRoundtripInput = {}): FoundationRoundtripResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('invalid-type', 'roundtrip input must be an object', 'input');
  }
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const total = input.total ?? DEFAULT_TOTAL;
  if (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD) {
    throw new InputError('invalid-integer', `threshold must be an integer >= ${MIN_THRESHOLD}`, 'threshold');
  }
  if (!Number.isInteger(total) || total < threshold) {
    throw new InputError('invalid-range', 'total must be an integer >= threshold', 'total');
  }
  if (total > MAX_TOTAL_SHARES) {
    throw new InputError('invalid-range', `total must be an integer <= ${MAX_TOTAL_SHARES}`, 'total');
  }

  const usedShareXs = resolveShareXs(threshold, total, input.shareXs);
  const privateKey = resolveSecret(input.secret);
  const publicKey = getPublicKeyCompressed(privateKey);
  const shares = splitSecret(privateKey, threshold, total);
  const recoveredPrivateKey = combineShares(pickShares(shares, usedShareXs));
  const recoveredPublicKey = getPublicKeyCompressed(recoveredPrivateKey);
  const privateHex = bytesToHex(privateKey);
  const recoveredHex = bytesToHex(recoveredPrivateKey);
  const publicHex = bytesToHex(publicKey);
  const recoveredPublicHex = bytesToHex(recoveredPublicKey);

  return {
    threshold,
    total,
    usedShareXs,
    privateKey: privateHex,
    publicKey: publicHex,
    recoveredPrivateKey: recoveredHex,
    recoveredPublicKey: recoveredPublicHex,
    match: privateHex === recoveredHex && publicHex === recoveredPublicHex,
  };
}

/** Same as `runFoundationRoundtrip`, but throws if reconstruction failed. */
export function assertFoundationRoundtrip(input: FoundationRoundtripInput = {}): FoundationRoundtripResult {
  const result = runFoundationRoundtrip(input);
  if (!result.match) {
    throw new Error('foundation roundtrip failed: recovered key does not match');
  }
  return result;
}

export function publicFoundationReport(result: FoundationRoundtripResult): FoundationCheckReport {
  if (!result || typeof result !== 'object') {
    throw new InputError('invalid-type', 'result must be a foundation roundtrip object', 'result');
  }
  return {
    ok: result.match,
    threshold: result.threshold,
    total: result.total,
    usedShareXs: [...result.usedShareXs],
    publicKey: result.publicKey,
    recoveredPublicKey: result.recoveredPublicKey,
  };
}
