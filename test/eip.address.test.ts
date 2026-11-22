import { describe, expect, it } from 'vitest';
import { getPublicKeyCompressed } from '../src/crypto/secp256k1';
import {
  ADDRESS_BYTES,
  ADDRESS_HEX_LENGTH,
  encodeEip55,
  publicKeyToAddress,
} from '../src/eip';
import { InputError } from '../src/errors';
import { bytesToHex } from '../src/utils/bytes';

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

describe('encodeEip55', () => {
  it('matches the mixed-case vectors from EIP-55', () => {
    expect(encodeEip55('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    );
    expect(encodeEip55('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359')).toBe(
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    );
    expect(encodeEip55('DBF03B407C01E7CD3CBEA99509D93F8DDDC8C6FB')).toBe(
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB'
    );
    expect(encodeEip55('d1220a0cf47c7b9be7a2e6ba89f429762e7b9adb')).toBe(
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'
    );
  });

  it('rejects a non-hex value and the wrong length', () => {
    expectCode(() => encodeEip55(1 as never), 'invalid-type', /hex string/);
    expectCode(() => encodeEip55('aa'), 'invalid-length', /20 bytes/);
  });
});

describe('publicKeyToAddress', () => {
  it('derives the checksum address of secp256k1 generator from a compressed key', () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    const compressed = getPublicKeyCompressed(one);
    expect(bytesToHex(compressed)).toBe('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    expect(publicKeyToAddress(compressed)).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
    expect(publicKeyToAddress(bytesToHex(compressed))).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
    expect(ADDRESS_BYTES).toBe(20);
    expect(ADDRESS_HEX_LENGTH).toBe(40);
  });

  it('rejects a point that is not a compressed secp256k1 key', () => {
    expectCode(() => publicKeyToAddress('02' + '00'.repeat(32)), 'invalid-range', /compressed secp256k1/);
    expectCode(() => publicKeyToAddress('aa'), 'invalid-length', /expected 33 bytes/);
  });
});
