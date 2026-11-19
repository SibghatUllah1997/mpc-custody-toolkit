import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import {
  KECCAK256_BYTES,
  MAX_PERSONAL_MESSAGE_BYTES,
  PERSONAL_MESSAGE_PREFIX,
  framePersonalMessage,
  hashPersonalMessage,
  hashPersonalMessageHex,
  hashPersonalMessageSource,
  hashPersonalMessageText,
  keccak256,
  personalMessagePrefix,
  resolvePersonalMessage,
} from '../src/eip';
import { bytesToHex } from '../src/utils/bytes';
import { signHash, verifyHash } from '../src/crypto/ecdsa';
import { generateKeyPair } from '../src/crypto/secp256k1';

function expectCode(fn: () => unknown, code: InputError['code'], pattern: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).message).toMatch(pattern);
  }
}

describe('keccak256', () => {
  it('returns 32 bytes and rejects a non-bytes argument', () => {
    expect(keccak256(new Uint8Array([1, 2, 3])).length).toBe(KECCAK256_BYTES);
    expectCode(() => keccak256('aa' as never), 'invalid-type', /Uint8Array/);
  });
});

describe('hashPersonalMessage', () => {
  it('matches the EIP-191 hash of "Hello World"', () => {
    const digest = hashPersonalMessageText('Hello World');
    expect(digest.length).toBe(32);
    expect(bytesToHex(digest)).toBe('a1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2');
  });

  it('uses UTF-8 byte length in the prefix, not JS string length', () => {
    // "é" is one JS code unit and two UTF-8 bytes (c3 a9).
    const framed = framePersonalMessage(new TextEncoder().encode('é'));
    const asText = new TextDecoder().decode(framed);
    expect(asText.startsWith(PERSONAL_MESSAGE_PREFIX)).toBe(true);
    expect(asText).toBe(`${PERSONAL_MESSAGE_PREFIX}2é`);
    expect(bytesToHex(personalMessagePrefix(2))).toBe(bytesToHex(framed.slice(0, framed.length - 2)));
  });

  it('treats text "00" and hex 00 as different payloads', () => {
    const fromText = bytesToHex(hashPersonalMessageText('00'));
    const fromHex = bytesToHex(hashPersonalMessageHex('00'));
    expect(fromText).not.toBe(fromHex);
    expect(fromHex).toBe(bytesToHex(hashPersonalMessage(new Uint8Array([0]))));
    expect(fromText).toBe(bytesToHex(hashPersonalMessageSource({ text: '00' })));
  });

  it('hashes an empty message and accepts empty hex', () => {
    const empty = hashPersonalMessage(new Uint8Array());
    expect(bytesToHex(empty)).toBe(bytesToHex(hashPersonalMessageText('')));
    expect(bytesToHex(empty)).toBe(bytesToHex(hashPersonalMessageHex('')));
    expect(bytesToHex(empty)).toBe('5f35dce98ba4fba25530a026ed80b2cecdaa31091ba4958b99b52ea1d068adad');
  });

  it('resolves exactly one of bytes, text, or hex', () => {
    const bytes = resolvePersonalMessage({ text: 'ab' });
    expect(new TextDecoder().decode(bytes)).toBe('ab');
    expect(resolvePersonalMessage({ hex: '0x0a' })).toEqual(new Uint8Array([0x0a]));
    expect(resolvePersonalMessage({ bytes: new Uint8Array([1, 2]) })).toEqual(new Uint8Array([1, 2]));
    expectCode(() => resolvePersonalMessage({} as never), 'invalid-type', /exactly one/);
    expectCode(() => resolvePersonalMessage({ text: 'a', hex: 'aa' } as never), 'invalid-type', /exactly one/);
    expectCode(() => resolvePersonalMessage(undefined as never), 'invalid-type', /must be an object/);
  });

  it('rejects oversized payloads, bad types, and odd-length hex', () => {
    const tooLong = new Uint8Array(MAX_PERSONAL_MESSAGE_BYTES + 1);
    expectCode(() => hashPersonalMessage(tooLong), 'invalid-length', /at most 65536/);
    expectCode(() => personalMessagePrefix(-1), 'invalid-integer', /non-negative integer/);
    expectCode(() => hashPersonalMessageText(1 as never), 'invalid-type', /text must be a string/);
    expectCode(() => hashPersonalMessageHex('0xabc'), 'invalid-hex', /even number/);
  });

  it('produces a digest that ECDSA can sign and verify', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const digest = hashPersonalMessageText('approve 1 ETH');
    const signature = signHash(digest, privateKey);
    expect(verifyHash(digest, signature, publicKey)).toBe(true);
  });
});
