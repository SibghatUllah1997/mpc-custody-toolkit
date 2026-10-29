import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';

describe('secp256k1 key generation', () => {
  it('generates a 32-byte private key and compressed public key', () => {
    const { privateKey, publicKey } = Secp256k1.generateKeyPair();
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(33);
  });
});

describe('Shamir secret sharing over secp256k1 field', () => {
  it('reconstructs 2-of-3 shares to the original secret', () => {
    const secret = Secp256k1.generatePrivateKey();
    const pub = Secp256k1.getPublicKeyCompressed(secret);

    const shares = Shamir.splitSecret(secret, 2, 3);
    expect(shares).toHaveLength(3);

    const recombined = Shamir.combineShares([shares[0], shares[2]]);
    expect(Buffer.from(recombined)).toEqual(Buffer.from(secret));

    const pub2 = Secp256k1.getPublicKeyCompressed(recombined);
    expect(Buffer.from(pub2)).toEqual(Buffer.from(pub));
  });

  it('throws on duplicate shares', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s1, s2] = Shamir.splitSecret(secret, 2, 2);
    expect(() => Shamir.combineShares([s1, s1, s2])).toThrow();
  });

  it('throws when given fewer than 2 shares', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s1] = Shamir.splitSecret(secret, 2, 2);
    expect(() => Shamir.combineShares([s1])).toThrow();
  });
});
