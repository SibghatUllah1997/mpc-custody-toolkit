import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from 'crypto';
import { hexToBytes } from '../utils/bytes.js';

/**
 * Shamir Secret Sharing over the secp256k1 scalar field (mod n).
 * Shares are (x, y) points on a random polynomial with constant term = secret.
 */

const FIELD_N: bigint = secp256k1.CURVE.n;
const BYTE_LENGTH = 32;

/** Maximum number of shares in a k-of-n split (n ≤ 8). */
export const MAX_TOTAL_SHARES = 8;
/** Minimum reconstruction threshold (k ≥ 2). */
export const MIN_THRESHOLD = 2;

export type Share = {
  x: number; // 1..totalShares
  y: Uint8Array; // 32 bytes, big-endian field element
};

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mod(a: bigint, m: bigint = FIELD_N): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

function addMod(a: bigint, b: bigint): bigint {
  return mod(a + b);
}

function subMod(a: bigint, b: bigint): bigint {
  return mod(a - b);
}

function mulMod(a: bigint, b: bigint): bigint {
  return mod(a * b);
}

// Extended Euclidean Algorithm for modular inverse
function invMod(a: bigint): bigint {
  let t = 0n, newT = 1n;
  let r = FIELD_N, newR = mod(a);
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r !== 1n) throw new Error('Element has no inverse modulo n');
  return mod(t);
}

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

function bigIntToBytesBE(num: bigint, length = BYTE_LENGTH): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(num & 0xffn);
    num >>= 8n;
  }
  return out;
}

function randomFieldElement(): bigint {
  // Rejection sample uniformly in [0, n-1]
  while (true) {
    const r = bytesToBigIntBE(randomBytes(BYTE_LENGTH));
    if (r < FIELD_N) return r;
  }
}

function ensureScalar(secret: Uint8Array | bigint | string): bigint {
  let s: bigint;
  if (typeof secret === 'string') {
    const bytes = hexToBytes(secret, BYTE_LENGTH);
    s = bytesToBigIntBE(bytes);
  } else if (typeof secret === 'bigint') {
    s = secret;
  } else {
    s = bytesToBigIntBE(secret);
  }
  assert(s > 0n && s < FIELD_N, 'Secret must be a non-zero 32-byte scalar < curve order');
  return s;
}

function evalPolynomialAt(coeffs: bigint[], x: bigint): bigint {
  // coeffs[0] = constant term (secret)
  let result = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = addMod(mulMod(result, x), coeffs[i]);
  }
  return result;
}

/**
 * Split a secret into `totalShares` shares with threshold `threshold`.
 * @param secret 32-byte private key (Uint8Array) or scalar bigint in (0, n)
 * @param threshold minimum number of shares to reconstruct (t)
 * @param totalShares total number of shares to produce (n)
 */
export function splitSecret(
  secret: Uint8Array | bigint | string,
  threshold: number,
  totalShares: number
): Share[] {
  assert(Number.isInteger(threshold) && threshold >= MIN_THRESHOLD, 'threshold must be an integer >= 2');
  assert(Number.isInteger(totalShares) && totalShares >= threshold, 'totalShares must be >= threshold');
  assert(totalShares <= MAX_TOTAL_SHARES, `totalShares must be <= ${MAX_TOTAL_SHARES}`);
  const s = ensureScalar(secret);

  // Random polynomial of degree (threshold - 1) with constant term = secret
  const coeffs: bigint[] = new Array(threshold);
  coeffs[0] = s;
  for (let i = 1; i < threshold; i++) {
    coeffs[i] = randomFieldElement();
  }

  // Use x = 1..totalShares
  const shares: Share[] = [];
  for (let x = 1; x <= totalShares; x++) {
    const xb = BigInt(x);
    const y = evalPolynomialAt(coeffs, xb);
    shares.push({ x, y: bigIntToBytesBE(y) });
  }
  return shares;
}

/**
 * Recombine shares to recover the original secret.
 * Accepts any subset of size >= 2; use exactly `threshold` shares from the split.
 */
export function combineShares(shares: Share[]): Uint8Array {
  assert(Array.isArray(shares) && shares.length >= 2, 'need at least 2 shares');
  // Validate unique x and y length
  const seen = new Set<number>();
  for (const sh of shares) {
    assert(Number.isInteger(sh.x) && sh.x > 0 && sh.x < Number.MAX_SAFE_INTEGER, 'share.x must be a positive integer');
    assert(sh.y instanceof Uint8Array && sh.y.length === BYTE_LENGTH, 'share.y must be 32 bytes');
    assert(!seen.has(sh.x), 'duplicate share x');
    seen.add(sh.x);
  }

  // Lagrange interpolation at x=0:
  // secret = Σ y_i * Π_{j≠i} ( -x_j * inv(x_i - x_j) )  (mod n)
  let secret = 0n;
  for (let i = 0; i < shares.length; i++) {
    const xi = BigInt(shares[i].x);
    const yi = bytesToBigIntBE(shares[i].y);

    let li = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      const xj = BigInt(shares[j].x);
      const numerator = mod(-xj); // (0 - xj)
      const denominator = subMod(xi, xj); // (xi - xj)
      li = mulMod(li, mulMod(numerator, invMod(denominator)));
    }
    secret = addMod(secret, mulMod(yi, li));
  }
  assert(secret > 0n && secret < FIELD_N, 'recombined secret out of range');
  return bigIntToBytesBE(secret);
}

export const utils = {
  FIELD_N,
  bytesToBigIntBE,
  bigIntToBytesBE
};
