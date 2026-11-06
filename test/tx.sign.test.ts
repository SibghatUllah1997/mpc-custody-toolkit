import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { SIGNATURE_COMPACT_BYTES } from '../src/crypto/ecdsa';
import { signTransaction, verifyTransaction, type Transaction } from '../src/tx';

function sample(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa11',
    to: 'bb22',
    value: '250',
    data: '0abc',
    ...overrides,
  };
}

describe('signTransaction / verifyTransaction', () => {
  it('round-trips a compact signature over the canonical digest', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signature = signTransaction(sample({ from: '0xAA11' }), privateKey);
    expect(signature.length).toBe(SIGNATURE_COMPACT_BYTES);
    expect(verifyTransaction(sample({ from: 'aa11' }), signature, publicKey)).toBe(true);
  });

  it('fails verification when any transaction field changes', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signature = signTransaction(sample(), privateKey);
    expect(verifyTransaction(sample({ value: '251' }), signature, publicKey)).toBe(false);
    expect(verifyTransaction(sample({ to: 'bb23' }), signature, publicKey)).toBe(false);
    expect(verifyTransaction(sample({ data: '0abd' }), signature, publicKey)).toBe(false);
  });

  it('fails verification against a different public key', () => {
    const signer = generateKeyPair();
    const other = generateKeyPair();
    const signature = signTransaction(sample(), signer.privateKey);
    expect(verifyTransaction(sample(), signature, other.publicKey)).toBe(false);
  });

  it('rejects the same malformed transactions as the digest helper', () => {
    const { privateKey } = generateKeyPair();
    expect(() => signTransaction(sample({ value: '01' }), privateKey)).toThrow(/decimal integer/);
    expect(() => signTransaction(sample({ from: '' }), privateKey)).toThrow(/from/);
  });
});
