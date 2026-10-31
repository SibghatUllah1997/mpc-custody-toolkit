import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';

describe('validation: secp256k1', () => {
  it('rejects non-32-byte private keys', () => {
    const bad = new Uint8Array([1, 2, 3]);
    expect(() => Secp256k1.getPublicKeyCompressed(bad)).toThrow();
  });
  it('rejects zero private key', () => {
    const zero = new Uint8Array(32);
    expect(() => Secp256k1.getPublicKeyCompressed(zero)).toThrow();
  });
});

describe('validation: shamir ensureScalar from hex', () => {
  it('accepts 0x-prefixed hex secret', () => {
    const sec = '0x' + '11'.repeat(32);
    const shares = Shamir.splitSecret(sec, 2, 2);
    const recombined = Shamir.combineShares(shares);
    const expected = new Uint8Array(32).fill(0x11);
    expect(Buffer.from(recombined)).toEqual(Buffer.from(expected));
  });
  it('rejects invalid length hex secret', () => {
    const sec = '0x' + '11'.repeat(31);
    expect(() => Shamir.splitSecret(sec, 2, 2)).toThrow();
  });
});

