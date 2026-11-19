import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import {
  EIP712_DOMAIN_TYPE,
  encodeType,
  hashDomain,
  hashStruct,
  hashTypedData,
  hashTypedDataParts,
  typeHash,
  typedDataDigestHex,
  type TypedData,
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

/** Canonical example from EIP-712. */
function etherMail(): TypedData {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: 1,
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    message: {
      from: {
        name: 'Cow',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
      },
      to: {
        name: 'Bob',
        wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
      },
      contents: 'Hello, Bob!',
    },
  };
}

describe('EIP-712 encodeType / hashTypedData', () => {
  it('encodes Mail with Person listed after the primary type', () => {
    const data = etherMail();
    expect(encodeType('Mail', data.types)).toBe(
      'Mail(Person from,Person to,string contents)Person(string name,address wallet)'
    );
    expect(bytesToHex(typeHash('Mail', data.types))).toBe(
      'a0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2'
    );
  });

  it('matches the EIP-712 domain separator, struct hash, and digest', () => {
    const parts = hashTypedDataParts(etherMail());
    expect(bytesToHex(parts.domainSeparator)).toBe(
      'f2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f'
    );
    expect(bytesToHex(parts.structHash)).toBe(
      'c52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e'
    );
    expect(bytesToHex(parts.digest)).toBe(
      'be609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2'
    );
    expect(typedDataDigestHex(etherMail())).toBe(bytesToHex(parts.digest));
    expect(bytesToHex(hashTypedData(etherMail()))).toBe(bytesToHex(parts.digest));
  });

  it('infers EIP712Domain fields when the type is omitted', () => {
    const data = etherMail();
    const { EIP712Domain: _ignored, ...rest } = data.types;
    const inferred = hashDomain(data.domain, rest);
    expect(bytesToHex(inferred)).toBe(bytesToHex(hashDomain(data.domain, data.types)));
  });

  it('hashes a uint256 array field as keccak of concatenated words', () => {
    const types = {
      Numbers: [{ name: 'xs', type: 'uint256[]' }],
    };
    const a = hashStruct('Numbers', { xs: [1, 2, 3] }, types);
    const b = hashStruct('Numbers', { xs: ['0x1', 2n, '3'] }, types);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
    const other = hashStruct('Numbers', { xs: [1, 2, 4] }, types);
    expect(bytesToHex(other)).not.toBe(bytesToHex(a));
  });

  it('ignores extra message keys and still signs the digest', () => {
    const data = etherMail();
    data.message.extra = 'ignored';
    const digest = hashTypedData(data);
    const { privateKey, publicKey } = generateKeyPair();
    expect(verifyHash(digest, signHash(digest, privateKey), publicKey)).toBe(true);
  });

  it('rejects missing fields, bad addresses, and a domain primary type', () => {
    const data = etherMail();
    expectCode(
      () => hashTypedData({ ...data, message: { ...data.message, contents: undefined as never } }),
      'missing-value',
      /contents is required/
    );
    expectCode(
      () =>
        hashTypedData({
          ...data,
          message: {
            ...data.message,
            from: { name: 'Cow', wallet: '0x11' },
          },
        }),
      'invalid-length',
      /20-byte address/
    );
    expectCode(
      () => hashTypedData({ ...data, primaryType: EIP712_DOMAIN_TYPE }),
      'invalid-type',
      /cannot be EIP712Domain/
    );
    expectCode(() => hashTypedData({} as never), 'missing-value', /primaryType is required/);
    expectCode(() => encodeType('Nope', data.types), 'invalid-type', /unknown type Nope/);
  });
});
