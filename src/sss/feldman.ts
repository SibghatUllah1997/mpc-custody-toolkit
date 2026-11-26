/**
 * Feldman verifiable secret sharing over secp256k1.
 *
 * A split publishes C_i = coeff_i * G. Share (x, y) checks as
 * y * G = Σ C_i * x^i, so one backup can be tested without combining.
 * C_0 is the public key. This does not hide the secret from k shares.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { PUBLIC_KEY_COMPRESSED_BYTES } from '../crypto/ecdsa.js';
import { InputError, type InputErrorCode } from '../errors/input.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import {
  MAX_TOTAL_SHARES,
  MIN_THRESHOLD,
  splitSecretWithCoeffs,
  type Share,
  utils,
} from './shamir.js';

const Point = secp256k1.ProjectivePoint;
const FIELD_N = utils.FIELD_N;

export const FELDMAN_COMMITMENT_TYPE = 'feldman-vss' as const;
export const FELDMAN_COMMITMENT_VERSION = 1 as const;
export const FELDMAN_CHECKSUM_HEX_LENGTH = 16;
/** Compressed encoding of the point at infinity (a zero coefficient). */
export const IDENTITY_POINT_HEX = '00';

export type FeldmanCommitment = {
  version: typeof FELDMAN_COMMITMENT_VERSION;
  type: typeof FELDMAN_COMMITMENT_TYPE;
  threshold: number;
  total: number;
  /** C_i = coeff_i * G as compressed hex. C_0 is the public key. */
  points: string[];
  checksum: { algo: 'sha256'; hex: string };
};

export type VerifiableSplit = {
  shares: Share[];
  commitment: FeldmanCommitment;
};

export const FELDMAN_COMMITMENT_SCHEMA: SchemaSpec = {
  type: FELDMAN_COMMITMENT_TYPE,
  label: 'Feldman VSS commitment',
  minVersion: 1,
  currentVersion: FELDMAN_COMMITMENT_VERSION,
  migrations: {},
};

const RECORD_KEYS = new Set(['type', 'version', 'threshold', 'total', 'points', 'checksum']);

function assert(condition: unknown, message: string, code: InputErrorCode = 'invalid-type'): asserts condition {
  if (!condition) throw new InputError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseScalar(
  value: Uint8Array | bigint | string,
  name: string,
  allowZero: boolean
): bigint {
  let s: bigint;
  if (typeof value === 'string') {
    s = utils.bytesToBigIntBE(hexToBytes(value, 32));
  } else if (typeof value === 'bigint') {
    s = value;
  } else if (value instanceof Uint8Array) {
    assert(value.length === 32, `${name} must be 32 bytes`, 'invalid-length');
    s = utils.bytesToBigIntBE(value);
  } else {
    throw new InputError('invalid-type', `${name} must be hex, bytes, or a bigint`, name);
  }
  if (allowZero) {
    assert(s >= 0n && s < FIELD_N, `${name} must be a field element < curve order`, 'invalid-range');
  } else {
    assert(s > 0n && s < FIELD_N, `${name} must be a non-zero 32-byte scalar < curve order`, 'invalid-range');
  }
  return s;
}

function reduceScalar(k: bigint): bigint {
  const s = ((k % FIELD_N) + FIELD_N) % FIELD_N;
  return s;
}

function mulPoint(point: InstanceType<typeof Point>, k: bigint): InstanceType<typeof Point> {
  if (point.is0()) return Point.ZERO;
  const s = reduceScalar(k);
  if (s === 0n) return Point.ZERO;
  return point.multiply(s);
}

function pointToHex(point: InstanceType<typeof Point>): string {
  if (point.is0()) return IDENTITY_POINT_HEX;
  return bytesToHex(point.toRawBytes(true));
}

function pointFromHex(hex: string, field: string): InstanceType<typeof Point> {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', `${field} must be a hex string`, field);
  }
  const h = normalizeHex(hex);
  if (h === IDENTITY_POINT_HEX) return Point.ZERO;
  const bytes = hexToBytes(h, PUBLIC_KEY_COMPRESSED_BYTES);
  try {
    return Point.fromBytes(bytes);
  } catch {
    throw new InputError('invalid-range', `${field} is not a compressed secp256k1 point`, field);
  }
}

function evaluateCommitments(points: readonly string[], x: bigint): InstanceType<typeof Point> {
  let acc = pointFromHex(points[points.length - 1], `points[${points.length - 1}]`);
  for (let i = points.length - 2; i >= 0; i--) {
    acc = mulPoint(acc, x).add(pointFromHex(points[i], `points[${i}]`));
  }
  return acc;
}

function checksumPayload(record: Omit<FeldmanCommitment, 'checksum'>): Record<string, unknown> {
  return {
    version: record.version,
    type: record.type,
    threshold: record.threshold,
    total: record.total,
    points: record.points,
  };
}

export function computeFeldmanChecksumHex(record: Omit<FeldmanCommitment, 'checksum'>): string {
  const digest = sha256(new TextEncoder().encode(stableStringify(checksumPayload(record))));
  return bytesToHex(digest).slice(0, FELDMAN_CHECKSUM_HEX_LENGTH);
}

function seal(body: { threshold: number; total: number; points: string[] }): FeldmanCommitment {
  const unsigned: Omit<FeldmanCommitment, 'checksum'> = {
    version: FELDMAN_COMMITMENT_VERSION,
    type: FELDMAN_COMMITMENT_TYPE,
    threshold: body.threshold,
    total: body.total,
    points: body.points,
  };
  return {
    ...unsigned,
    checksum: { algo: 'sha256', hex: computeFeldmanChecksumHex(unsigned) },
  };
}

function assertCommitmentShape(threshold: number, total: number, pointCount: number): void {
  assert(
    Number.isInteger(threshold) && threshold >= MIN_THRESHOLD,
    'threshold must be an integer >= 2',
    'invalid-integer'
  );
  assert(
    Number.isInteger(total) && total >= threshold && total <= MAX_TOTAL_SHARES,
    `total must be an integer from threshold through ${MAX_TOTAL_SHARES}`,
    'invalid-range'
  );
  assert(pointCount === threshold, `expected ${threshold} commitment points, got ${pointCount}`, 'invalid-length');
}

/** Public key encoded as the constant-term commitment C_0. */
export function publicKeyFromCommitment(commitment: FeldmanCommitment): string {
  assert(commitment && typeof commitment === 'object', 'commitment must be an object');
  assertCommitmentShape(commitment.threshold, commitment.total, commitment.points?.length ?? 0);
  const hex = commitment.points[0];
  if (hex === IDENTITY_POINT_HEX) {
    throw new InputError('invalid-range', 'C_0 must be a non-identity public key', 'points');
  }
  pointFromHex(hex, 'points[0]');
  return normalizeHex(hex);
}

/**
 * Split `secret` with caller-supplied higher-degree coefficients and publish
 * Feldman commitments. Zero higher coefficients encode as `00`.
 */
export function commitCoefficients(
  secret: Uint8Array | bigint | string,
  higherCoeffs: Array<Uint8Array | bigint | string>,
  total: number
): VerifiableSplit {
  assert(Array.isArray(higherCoeffs), 'higherCoeffs must be an array');
  const shares = splitSecretWithCoeffs(secret, higherCoeffs, total);
  const coeffs = [parseScalar(secret, 'Secret', false)];
  for (let i = 0; i < higherCoeffs.length; i++) {
    coeffs.push(parseScalar(higherCoeffs[i], `higherCoeffs[${i}]`, true));
  }
  const points = coeffs.map((c) => pointToHex(mulPoint(Point.BASE, c)));
  return {
    shares,
    commitment: seal({ threshold: coeffs.length, total, points }),
  };
}

/**
 * Split a secret into a k-of-n set and publish Feldman commitments.
 * Higher-degree coefficients are sampled as non-zero scalars.
 */
export function splitSecretVerifiable(
  secret: Uint8Array | bigint | string,
  threshold: number,
  total: number
): VerifiableSplit {
  assert(
    Number.isInteger(threshold) && threshold >= MIN_THRESHOLD,
    'threshold must be an integer >= 2',
    'invalid-integer'
  );
  const higher: Uint8Array[] = [];
  for (let i = 1; i < threshold; i++) {
    higher.push(secp256k1.utils.randomPrivateKey());
  }
  return commitCoefficients(secret, higher, total);
}

/**
 * Check one share against published commitments. Does not reconstruct the secret.
 */
export function verifyShare(share: Share, commitment: FeldmanCommitment): void {
  assert(share && typeof share === 'object', 'share must be an object');
  assert(commitment && typeof commitment === 'object', 'commitment must be an object');
  assertCommitmentShape(commitment.threshold, commitment.total, commitment.points?.length ?? 0);
  assert(
    Number.isInteger(share.x) && share.x >= 1 && share.x <= commitment.total,
    `share.x must be an integer in 1..${commitment.total}`,
    'invalid-range'
  );
  assert(share.y instanceof Uint8Array && share.y.length === 32, 'share.y must be 32 bytes', 'invalid-length');
  const y = utils.bytesToBigIntBE(share.y);
  assert(y < FIELD_N, 'share.y must be a field element < curve order', 'invalid-range');
  const lhs = mulPoint(Point.BASE, y);
  const rhs = evaluateCommitments(commitment.points, BigInt(share.x));
  if (!lhs.equals(rhs)) {
    throw new InputError('mismatch', `share x=${share.x} does not match the Feldman commitments`, 'share');
  }
}

export function encodeFeldmanCommitment(commitment: FeldmanCommitment): string {
  verifyCommitment(commitment);
  return JSON.stringify(seal({
    threshold: commitment.threshold,
    total: commitment.total,
    points: commitment.points.map((p, i) => pointToHex(pointFromHex(p, `points[${i}]`))),
  }), null, 2);
}

function verifyCommitment(commitment: FeldmanCommitment): void {
  assert(commitment && typeof commitment === 'object', 'commitment must be an object');
  assertCommitmentShape(commitment.threshold, commitment.total, commitment.points?.length ?? 0);
  publicKeyFromCommitment(commitment);
  for (let i = 1; i < commitment.points.length; i++) {
    pointFromHex(commitment.points[i], `points[${i}]`);
  }
}

export function decodeFeldmanCommitment(json: string): FeldmanCommitment {
  const { doc } = upgradeDocument(parseDocument(json), FELDMAN_COMMITMENT_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!RECORD_KEYS.has(k)) {
      throw new InputError('invalid-type', `unexpected Feldman commitment field: ${k}`, k);
    }
  }
  const checksum = doc.checksum;
  if (!isRecord(checksum) || checksum.algo !== 'sha256' || typeof checksum.hex !== 'string') {
    throw new InputError('mismatch', 'Feldman commitment checksum missing or unsupported', 'checksum');
  }
  assert(Array.isArray(doc.points), 'points must be an array', 'invalid-type');
  const points = (doc.points as unknown[]).map((p, i) => {
    assert(typeof p === 'string', `points[${i}] must be a hex string`, 'invalid-type');
    return pointToHex(pointFromHex(p, `points[${i}]`));
  });
  const expected = seal({
    threshold: doc.threshold as number,
    total: doc.total as number,
    points,
  });
  assertCommitmentShape(expected.threshold, expected.total, expected.points.length);
  publicKeyFromCommitment(expected);
  if (checksum.hex.toLowerCase() !== expected.checksum.hex) {
    throw new InputError('mismatch', 'Feldman commitment checksum mismatch', 'checksum');
  }
  return expected;
}
