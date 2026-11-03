import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';

describe('k-of-n split limits (n ≤ 8)', () => {
  it('splits and recombines at the maximum n of 8', () => {
    const secret = Secp256k1.generatePrivateKey();
    const shares = Shamir.splitSecret(secret, 8, 8);
    expect(shares).toHaveLength(Shamir.MAX_TOTAL_SHARES);
    expect(shares.map((s) => s.x)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const recombined = Shamir.combineShares(shares);
    expect(Buffer.from(recombined)).toEqual(Buffer.from(secret));
  });

  it('reconstructs a 3-of-5 split from a qualifying subset', () => {
    const secret = Secp256k1.generatePrivateKey();
    const shares = Shamir.splitSecret(secret, 3, 5);
    expect(shares).toHaveLength(5);
    const recombined = Shamir.combineShares([shares[0], shares[2], shares[4]]);
    expect(Buffer.from(recombined)).toEqual(Buffer.from(secret));
  });

  it('rejects totalShares greater than 8', () => {
    const secret = Secp256k1.generatePrivateKey();
    expect(() => Shamir.splitSecret(secret, 2, 9)).toThrow(/totalShares must be <= 8/);
  });

  it('rejects a 9-of-9 split because n exceeds the cap', () => {
    const secret = Secp256k1.generatePrivateKey();
    expect(() => Shamir.splitSecret(secret, 9, 9)).toThrow(/totalShares must be <= 8/);
  });
});
