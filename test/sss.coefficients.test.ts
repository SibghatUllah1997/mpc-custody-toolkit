import { describe, it, expect } from 'vitest';
import { Shamir } from '../src';

const N = Shamir.utils.FIELD_N;
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('splitWithCoefficients', () => {
  it('evaluates y = a0 + a1*x at x = 1..n', () => {
    const shares = Shamir.splitWithCoefficients([5n, 3n], 3);
    expect(shares.map((s) => s.x)).toEqual([1, 2, 3]);
    expect(shares.map((s) => BigInt('0x' + hex(s.y)))).toEqual([8n, 11n, 14n]);
  });

  it('reduces modulo the curve order', () => {
    const shares = Shamir.splitWithCoefficients([1n, N - 1n], 2);
    // x = 1: 1 + (n - 1) = n = 0 (mod n); x = 2: 1 + 2(n - 1) = n - 1 (mod n)
    expect(BigInt('0x' + hex(shares[0].y))).toBe(0n);
    expect(BigInt('0x' + hex(shares[1].y))).toBe(N - 1n);
  });

  it('is deterministic', () => {
    const a = Shamir.splitWithCoefficients([7n, 11n, 13n], 5);
    const b = Shamir.splitWithCoefficients([7n, 11n, 13n], 5);
    expect(a).toEqual(b);
  });

  it('rejects a zero leading coefficient', () => {
    expect(() => Shamir.splitWithCoefficients([7n, 11n, 0n], 4)).toThrow(/leading coefficient/);
  });

  it('rejects a zero secret and out-of-range coefficients', () => {
    expect(() => Shamir.splitWithCoefficients([0n, 1n], 2)).toThrow(/non-zero/);
    expect(() => Shamir.splitWithCoefficients([1n, N], 2)).toThrow(/scalars in \[0, n\)/);
    expect(() => Shamir.splitWithCoefficients([1n, -1n], 2)).toThrow(/scalars in \[0, n\)/);
  });

  it('rejects too few coefficients and bad share counts', () => {
    expect(() => Shamir.splitWithCoefficients([1n], 3)).toThrow(/at least 2 coefficients/);
    expect(() => Shamir.splitWithCoefficients([1n, 2n, 3n], 2)).toThrow(/>= threshold/);
    expect(() => Shamir.splitWithCoefficients([1n, 2n], 9)).toThrow(/<= 8/);
  });
});
