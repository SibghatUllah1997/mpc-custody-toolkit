import { describe, it, expect } from 'vitest';
import { Shamir } from '../src';
import { bytesToHex } from '../src/utils/bytes';

function pad32(n: bigint): string {
  return n.toString(16).padStart(64, '0');
}

describe('splitSecretWithCoeffs', () => {
  it('evaluates a linear polynomial y = 1 + 2x at x = 1..3', () => {
    const shares = Shamir.splitSecretWithCoeffs(1n, [2n], 3);
    expect(shares.map((s) => ({ x: s.x, y: bytesToHex(s.y) }))).toEqual([
      { x: 1, y: pad32(3n) },
      { x: 2, y: pad32(5n) },
      { x: 3, y: pad32(7n) },
    ]);
    const recovered = Shamir.combineShares([shares[0], shares[2]]);
    expect(bytesToHex(recovered)).toBe(pad32(1n));
  });

  it('evaluates a quadratic y = 7 + 3x + 5x^2 at x = 1..5', () => {
    const shares = Shamir.splitSecretWithCoeffs(7n, [3n, 5n], 5);
    expect(shares).toHaveLength(5);
    expect(bytesToHex(shares[0].y)).toBe(pad32(15n));
    expect(bytesToHex(shares[1].y)).toBe(pad32(33n));
    expect(bytesToHex(shares[2].y)).toBe(pad32(61n));
    expect(bytesToHex(shares[3].y)).toBe(pad32(99n));
    expect(bytesToHex(shares[4].y)).toBe(pad32(147n));
    const recovered = Shamir.combineShares([shares[0], shares[2], shares[4]]);
    expect(bytesToHex(recovered)).toBe(pad32(7n));
  });

  it('accepts a zero higher-degree coefficient and still reconstructs', () => {
    const shares = Shamir.splitSecretWithCoeffs(11n, [0n], 2);
    expect(bytesToHex(shares[0].y)).toBe(pad32(11n));
    expect(bytesToHex(shares[1].y)).toBe(pad32(11n));
    expect(bytesToHex(Shamir.combineShares(shares))).toBe(pad32(11n));
  });

  it('wraps share y values modulo the curve order', () => {
    const n = Shamir.utils.FIELD_N;
    const secret = n - 1n;
    const shares = Shamir.splitSecretWithCoeffs(secret, [1n], 3);
    expect(bytesToHex(shares[0].y)).toBe(pad32(0n));
    expect(bytesToHex(shares[1].y)).toBe(pad32(1n));
    expect(bytesToHex(shares[2].y)).toBe(pad32(2n));
    expect(bytesToHex(Shamir.combineShares([shares[0], shares[1]]))).toBe(pad32(secret));
  });

  it('accepts 32-byte hex strings for the secret and coefficients', () => {
    const shares = Shamir.splitSecretWithCoeffs(pad32(4n), [pad32(1n)], 2);
    expect(bytesToHex(shares[0].y)).toBe(pad32(5n));
    expect(bytesToHex(shares[1].y)).toBe(pad32(6n));
  });

  it('rejects an empty coefficient list (threshold would be 1)', () => {
    expect(() => Shamir.splitSecretWithCoeffs(1n, [], 2)).toThrow(/higher-degree coefficient/);
  });

  it('rejects totalShares below the implied threshold or above 8', () => {
    expect(() => Shamir.splitSecretWithCoeffs(1n, [2n, 3n], 2)).toThrow(/totalShares must be >= threshold/);
    expect(() => Shamir.splitSecretWithCoeffs(1n, [2n], 9)).toThrow(/totalShares must be <= 8/);
  });

  it('rejects a zero secret', () => {
    expect(() => Shamir.splitSecretWithCoeffs(0n, [1n], 2)).toThrow(/non-zero/);
  });
});
