import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Shamir } from '../src';
import vectors from './vectors/shamir.json';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

type Vector = (typeof vectors)[number];

function subsets<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}

function toShares(v: Vector) {
  return v.shares.map((s) => ({ x: s.x, y: fromHex(s.y) }));
}

describe('Shamir deterministic test vectors', () => {
  for (const v of vectors) {
    describe(v.name, () => {
      const coefficients = v.coefficients.map((c) => BigInt('0x' + c));
      const secretHex = v.coefficients[0];

      it('reproduces the expected shares exactly', () => {
        const shares = Shamir.splitWithCoefficients(coefficients, v.total);
        expect(shares.map((s) => ({ x: s.x, y: hex(s.y) }))).toEqual(v.shares);
      });

      it('recovers the secret from every threshold-sized subset', () => {
        const all = toShares(v);
        const combos = subsets(all, v.threshold);
        expect(combos.length).toBeGreaterThan(0);
        for (const combo of combos) {
          expect(hex(Shamir.combineShares(combo))).toBe(secretHex);
        }
      });

      it('recovers the secret from all shares, in any order', () => {
        const all = toShares(v);
        expect(hex(Shamir.combineShares(all))).toBe(secretHex);
        expect(hex(Shamir.combineShares([...all].reverse()))).toBe(secretHex);
      });

      it('does not recover the secret from fewer than threshold shares', () => {
        if (v.threshold < 3) return; // two points always interpolate to *some* line
        const all = toShares(v);
        for (const combo of subsets(all, v.threshold - 1)) {
          expect(hex(Shamir.combineShares(combo))).not.toBe(secretHex);
        }
      });
    });
  }

  it('ties the vectors to the curve: secret 1 gives G and n-1 gives -G', () => {
    const one = vectors.find((v) => BigInt('0x' + v.coefficients[0]) === 1n)!;
    const minusOne = vectors.find((v) => BigInt('0x' + v.coefficients[0]) === secp256k1.CURVE.n - 1n)!;
    const G = secp256k1.ProjectivePoint.BASE;
    const pub = (v: Vector) =>
      secp256k1.ProjectivePoint.fromPrivateKey(Shamir.combineShares(toShares(v).slice(0, v.threshold)));
    expect(pub(one).equals(G)).toBe(true);
    expect(pub(minusOne).equals(G.negate())).toBe(true);
  });
});
