import { describe, expect, it } from 'vitest';
import {
  parseTypedDataJson,
  runHashMessage,
  runHashTyped,
  runSigningPrompt,
} from '../src/cli';
import { hashPersonalMessageText, typedDataDigestHex, type TypedData } from '../src/eip';
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

function mailJson(): string {
  const data: TypedData = {
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
      from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  };
  return JSON.stringify(data);
}

describe('CLI hash-message / hash-typed', () => {
  it('hashes personal_sign text and hex', () => {
    const text = runHashMessage({ text: 'Hello World' });
    expect(text.kind).toBe('eip-191');
    expect(text.bytes).toBe(11);
    expect(text.digest).toBe(bytesToHex(hashPersonalMessageText('Hello World')));
    const hex = runHashMessage({ hex: '0x00' });
    expect(hex.bytes).toBe(1);
    expect(hex.digest).not.toBe(text.digest);
  });

  it('rejects missing or combined personal-message flags', () => {
    expectCode(() => runHashMessage({}), 'missing-value', /--text <string> or --hex/);
    expectCode(() => runHashMessage({ text: 'a', hex: 'aa' }), 'invalid-type', /not both/);
  });

  it('hashes the EIP-712 Mail example and parses typed JSON', () => {
    const typed = parseTypedDataJson(mailJson());
    const out = runHashTyped(typed);
    expect(out.kind).toBe('eip-712');
    expect(out.primaryType).toBe('Mail');
    expect(out.digest).toBe('be609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
    expect(out.digest).toBe(typedDataDigestHex(typed));
    expectCode(() => parseTypedDataJson('{'), 'invalid-json', /Invalid JSON for --typed/);
    expectCode(() => parseTypedDataJson('[]'), 'invalid-type', /must be a JSON object/);
  });
});

describe('CLI prompt for EIP payloads', () => {
  it('prints an EIP-191 prompt whose digest matches hash-message', () => {
    const hashed = runHashMessage({ text: 'Hello World' });
    const prompt = runSigningPrompt({ text: 'Hello World' });
    expect(prompt.title).toBe('EIP-191 personal message');
    expect(prompt.digestHex).toBe(hashed.digest);
    expect(prompt.text).toContain('EIP-191 personal_sign');
  });

  it('prints an EIP-712 prompt whose digest matches hash-typed', () => {
    const typed = parseTypedDataJson(mailJson());
    const hashed = runHashTyped(typed);
    const prompt = runSigningPrompt({ typedData: typed });
    expect(prompt.title).toBe('EIP-712 typed data');
    expect(prompt.digestHex).toBe(hashed.digest);
    expect(prompt.text).toContain('Domain       Ether Mail');
  });
});
