import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { SIGNATURE_COMPACT_BYTES } from '../src/crypto/ecdsa';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { splitSecret } from '../src/sss/shamir';
import { bytesToHex } from '../src/utils/bytes';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_TOTAL,
  setupThresholdKey,
  signTransactionWithShares,
  signWithShares,
  verifyThresholdSignature,
  verifyThresholdTransaction,
} from '../src/threshold';
import type { Transaction } from '../src/tx';

function digest(text: string): Uint8Array {
  return sha256(new TextEncoder().encode(text));
}

function sampleTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa11',
    to: 'bb22',
    value: '75',
    data: '0abc',
    ...overrides,
  };
}

describe('setupThresholdKey', () => {
  it('issues a 2-of-3 split by default and never exposes the private key', () => {
    const setup = setupThresholdKey();
    expect(setup.threshold).toBe(DEFAULT_THRESHOLD);
    expect(setup.total).toBe(DEFAULT_TOTAL);
    expect(setup.shares).toHaveLength(3);
    expect(setup.publicKey.length).toBe(33);
    expect(setup.shares.map((s) => s.x)).toEqual([1, 2, 3]);
    expect('privateKey' in setup).toBe(false);
  });

  it('respects an explicit 3-of-5 split', () => {
    const setup = setupThresholdKey({ threshold: 3, total: 5 });
    expect(setup.shares).toHaveLength(5);
    expect(setup.threshold).toBe(3);
  });
});

describe('signWithShares (offline combine)', () => {
  it('any pair of 2-of-3 shares produces a signature that verifies on the original public key', () => {
    const setup = setupThresholdKey();
    const hash = digest('threshold-offline');
    const pairs = [
      [setup.shares[0], setup.shares[1]],
      [setup.shares[0], setup.shares[2]],
      [setup.shares[1], setup.shares[2]],
    ];

    for (const pair of pairs) {
      const result = signWithShares(pair, hash, setup.publicKey);
      expect(result.signature.length).toBe(SIGNATURE_COMPACT_BYTES);
      expect(bytesToHex(result.publicKey)).toBe(bytesToHex(setup.publicKey));
      expect(verifyThresholdSignature(result)).toBe(true);
      expect(result.usedShareXs).toEqual(pair.map((s) => s.x).sort((a, b) => a - b));
    }
  });

  it('is deterministic for the same share subset and digest', () => {
    const setup = setupThresholdKey();
    const hash = digest('same-pair');
    const pair = [setup.shares[0], setup.shares[2]];
    const a = signWithShares(pair, hash, setup.publicKey);
    const b = signWithShares(pair, hash, setup.publicKey);
    expect(bytesToHex(a.signature)).toBe(bytesToHex(b.signature));
  });

  it('rejects a single share and a mismatched expected public key', () => {
    const setup = setupThresholdKey();
    const hash = digest('need-two');
    expect(() => signWithShares([setup.shares[0]], hash)).toThrow(/at least 2 shares/);

    const other = generateKeyPair();
    expect(() => signWithShares(setup.shares.slice(0, 2), hash, other.publicKey)).toThrow(
      /does not match the expected public key/
    );
  });

  it('does not verify against a public key from a different split', () => {
    const alice = setupThresholdKey();
    const bob = setupThresholdKey();
    const hash = digest('wrong-vault');
    const result = signWithShares(alice.shares.slice(0, 2), hash, alice.publicKey);
    expect(verifyThresholdSignature({ ...result, publicKey: bob.publicKey })).toBe(false);
  });
});

describe('signTransactionWithShares', () => {
  it('round-trips a transfer signed from any 2 of 3 shares', () => {
    const setup = setupThresholdKey();
    const tx = sampleTx();
    const result = signTransactionWithShares(
      [setup.shares[1], setup.shares[2]],
      tx,
      setup.publicKey
    );
    expect(verifyThresholdTransaction(tx, result)).toBe(true);
    expect(verifyThresholdTransaction(sampleTx({ value: '76' }), result)).toBe(false);
  });

  it('still reconstructs when the caller omits the expected public key', () => {
    const secret = generateKeyPair().privateKey;
    const shares = splitSecret(secret, 2, 3);
    const result = signTransactionWithShares([shares[0], shares[1]], sampleTx());
    expect(verifyThresholdTransaction(sampleTx(), result)).toBe(true);
  });
});
