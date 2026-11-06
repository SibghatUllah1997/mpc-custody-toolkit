import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import {
  MESSAGE_HASH_BYTES,
  SIGNATURE_COMPACT_BYTES,
  signHash,
  verifyHash,
} from '../src/crypto/ecdsa';
import { generateKeyPair, getPublicKeyCompressed } from '../src/crypto/secp256k1';
import { bytesToHex } from '../src/utils/bytes';

function digest(text: string): Uint8Array {
  return sha256(new TextEncoder().encode(text));
}

describe('signHash / verifyHash', () => {
  it('round-trips a compact signature over a 32-byte digest', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const hash = digest('custody-demo');
    expect(hash.length).toBe(MESSAGE_HASH_BYTES);

    const signature = signHash(hash, privateKey);
    expect(signature.length).toBe(SIGNATURE_COMPACT_BYTES);
    expect(verifyHash(hash, signature, publicKey)).toBe(true);
  });

  it('is deterministic for the same key and digest', () => {
    const { privateKey } = generateKeyPair();
    const hash = digest('same-input');
    const a = signHash(hash, privateKey);
    const b = signHash(hash, privateKey);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it('rejects a tampered digest or a different public key', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const hash = digest('original');
    const signature = signHash(hash, alice.privateKey);

    const other = digest('tampered');
    expect(verifyHash(other, signature, alice.publicKey)).toBe(false);
    expect(verifyHash(hash, signature, bob.publicKey)).toBe(false);
  });

  it('throws on a digest or key of the wrong length', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const hash = digest('ok');
    const signature = signHash(hash, privateKey);

    expect(() => signHash(hash.slice(0, 16), privateKey)).toThrow(/messageHash/);
    expect(() => signHash(hash, privateKey.slice(0, 16))).toThrow(/privateKey/);
    expect(() => verifyHash(hash, signature.slice(0, 32), publicKey)).toThrow(/signature/);
    expect(() => verifyHash(hash, signature, publicKey.slice(0, 16))).toThrow(/publicKey/);
  });

  it('throws on an all-zero private key and on a malformed compressed public key', () => {
    const hash = digest('zero-key');
    const zero = new Uint8Array(32);
    expect(() => signHash(hash, zero)).toThrow(/privateKey/);

    const { privateKey } = generateKeyPair();
    const signature = signHash(hash, privateKey);
    const bogus = new Uint8Array(33);
    bogus[0] = 0x02;
    expect(() => verifyHash(hash, signature, bogus)).toThrow(/publicKey/);
  });

  it('still verifies against the compressed public key derived from the signer', () => {
    const { privateKey } = generateKeyPair();
    const hash = digest('derived');
    const signature = signHash(hash, privateKey);
    expect(verifyHash(hash, signature, getPublicKeyCompressed(privateKey))).toBe(true);
  });
});
