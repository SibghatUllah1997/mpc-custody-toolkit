import { describe, expect, it } from 'vitest';
import { Secp256k1, Shamir, Vss } from '../src';
import { InputError } from '../src/errors';
import { bytesToHex } from '../src/utils/bytes';

function pad32(n: bigint): string {
  return n.toString(16).padStart(64, '0');
}

function expectCode(fn: () => unknown, code: InputError['code'], pattern?: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    if (pattern) expect((err as InputError).message).toMatch(pattern);
  }
}

describe('splitSecretVerifiable', () => {
  it('publishes commitments that match every share and the public key', () => {
    const secret = Secp256k1.generatePrivateKey();
    const { shares, commitment } = Vss.splitSecretVerifiable(secret, 2, 3);
    expect(shares).toHaveLength(3);
    expect(commitment.points).toHaveLength(2);
    expect(commitment.threshold).toBe(2);
    expect(commitment.total).toBe(3);
    expect(Vss.publicKeyFromCommitment(commitment)).toBe(bytesToHex(Secp256k1.getPublicKeyCompressed(secret)));
    for (const share of shares) {
      expect(() => Vss.verifyShare(share, commitment)).not.toThrow();
    }
    expect(bytesToHex(Shamir.combineShares([shares[0], shares[2]]))).toBe(bytesToHex(secret));
  });

  it('rejects a share whose y was edited', () => {
    const secret = Secp256k1.generatePrivateKey();
    const { shares, commitment } = Vss.splitSecretVerifiable(secret, 2, 3);
    const bad = { x: shares[0].x, y: new Uint8Array(shares[0].y) };
    bad.y[31] ^= 1;
    expectCode(() => Vss.verifyShare(bad, commitment), 'mismatch', /does not match/);
  });
});

describe('commitCoefficients', () => {
  it('verifies the linear polynomial y = 1 + 2x', () => {
    const { shares, commitment } = Vss.commitCoefficients(1n, [2n], 3);
    expect(bytesToHex(shares[0].y)).toBe(pad32(3n));
    for (const share of shares) Vss.verifyShare(share, commitment);
  });

  it('encodes a zero higher coefficient as the identity point', () => {
    const { shares, commitment } = Vss.commitCoefficients(11n, [0n], 2);
    expect(commitment.points[1]).toBe(Vss.IDENTITY_POINT_HEX);
    for (const share of shares) Vss.verifyShare(share, commitment);
    expect(bytesToHex(Shamir.combineShares(shares))).toBe(pad32(11n));
  });

  it('verifies a share whose y wraps to zero', () => {
    const n = Shamir.utils.FIELD_N;
    const { shares, commitment } = Vss.commitCoefficients(n - 1n, [1n], 3);
    expect(bytesToHex(shares[0].y)).toBe(pad32(0n));
    Vss.verifyShare(shares[0], commitment);
    Vss.verifyShare(shares[1], commitment);
  });
});

describe('encodeFeldmanCommitment / decodeFeldmanCommitment', () => {
  it('round-trips a sealed commitment file', () => {
    const secret = Secp256k1.generatePrivateKey();
    const { commitment } = Vss.splitSecretVerifiable(secret, 3, 5);
    const json = Vss.encodeFeldmanCommitment(commitment);
    const loaded = Vss.decodeFeldmanCommitment(json);
    expect(loaded).toEqual(commitment);
    expect(JSON.parse(json).checksum.hex).toHaveLength(16);
  });

  it('catches a checksum edit and an unknown field', () => {
    const secret = Secp256k1.generatePrivateKey();
    const { commitment } = Vss.splitSecretVerifiable(secret, 2, 3);
    const parsed = JSON.parse(Vss.encodeFeldmanCommitment(commitment));
    parsed.total = 4;
    expectCode(() => Vss.decodeFeldmanCommitment(JSON.stringify(parsed)), 'mismatch', /checksum mismatch/);
    parsed.total = 3;
    parsed.extra = true;
    expectCode(
      () => Vss.decodeFeldmanCommitment(JSON.stringify(parsed)),
      'invalid-type',
      /unexpected Feldman commitment field/
    );
  });
});
