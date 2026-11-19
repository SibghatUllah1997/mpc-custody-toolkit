import { describe, expect, it } from 'vitest';
import { describeDigestSigning, describePersonalSigning, describeSigningRequest, describeTypedDataSigning } from '../src/prompt';
import { hashPersonalMessageText, typedDataDigestHex, type TypedData } from '../src/eip';
import { transactionDigest } from '../src/tx';
import { bytesToHex } from '../src/utils/bytes';
import type { PolicyDecision } from '../src/policy';
import type { SimulationResult } from '../src/sim';
import type { Transaction } from '../src/tx';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa11',
    to: 'bb22',
    value: '250',
    data: '0abc',
    ...overrides,
  };
}

describe('describeSigningRequest', () => {
  it('lists from, to, value, data size, and the canonical digest', () => {
    const prompt = describeSigningRequest({ tx: tx({ from: '0xAA11' }) });
    const digest = bytesToHex(transactionDigest(tx({ from: 'aa11' })));
    expect(prompt.title).toBe('Signing request');
    expect(prompt.digestHex).toBe(digest);
    expect(prompt.text).toContain('From         aa11');
    expect(prompt.text).toContain('To           bb22');
    expect(prompt.text).toContain('Value        250');
    expect(prompt.text).toContain('Data         0abc (2 bytes)');
    expect(prompt.text).toContain(`Digest       ${digest}`);
    expect(Object.isFrozen(prompt)).toBe(true);
    expect(Object.isFrozen(prompt.lines)).toBe(true);
  });

  it('shows an empty data field and an optional asset ticker', () => {
    const prompt = describeSigningRequest({ tx: tx({ data: '' }), asset: 'ETH' });
    expect(prompt.text).toContain('Value        250 ETH');
    expect(prompt.text).toContain('Data         (empty)');
  });

  it('appends policy and simulation lines when those results are supplied', () => {
    const policy: PolicyDecision = {
      allowed: true,
      reasons: [],
      approvalCount: 2,
    };
    const simulation: SimulationResult = {
      dataBytes: 2,
      zeroBytes: 0,
      nonZeroBytes: 2,
      gasUnits: '21032',
      fee: '42',
      total: '292',
      limit: {
        asset: 'ETH',
        maxValue: '1000',
        counted: '292',
        withinLimit: true,
        headroom: '708',
        excess: '0',
      },
    };
    const prompt = describeSigningRequest({ tx: tx(), policy, simulation });
    expect(prompt.text).toContain('Approvals    2 recorded (policy allows)');
    expect(prompt.text).toContain('Gas          21032');
    expect(prompt.text).toContain('Fee          42');
    expect(prompt.text).toContain('Total        292');
    expect(prompt.text).toContain('Limit        292 of 1000 ETH (headroom 708)');
  });

  it('flags a denied policy and an exceeded spend limit', () => {
    const policy: PolicyDecision = {
      allowed: false,
      reasons: [{ code: 'insufficient-approvals', message: 'need more' }],
      approvalCount: 1,
    };
    const simulation: SimulationResult = {
      dataBytes: 0,
      zeroBytes: 0,
      nonZeroBytes: 0,
      gasUnits: '21000',
      fee: '10',
      total: '260',
      limit: {
        asset: 'ETH',
        maxValue: '100',
        counted: '260',
        withinLimit: false,
        headroom: '0',
        excess: '160',
      },
    };
    const prompt = describeSigningRequest({ tx: tx(), policy, simulation });
    expect(prompt.text).toContain('policy denies');
    expect(prompt.text).toContain('260 exceeds 100 ETH');
  });

  it('rejects a missing input and an invalid transaction', () => {
    expect(() => describeSigningRequest(undefined as never)).toThrow(/must be an object/);
    expect(() => describeSigningRequest({ tx: tx({ value: '01' }) })).toThrow(/decimal integer/);
  });
});

describe('describeDigestSigning', () => {
  it('explains a raw digest, optional share indexes, and a public key', () => {
    const digestHex = 'ab'.repeat(32);
    const publicKeyHex = `02${'cd'.repeat(32)}`;
    const prompt = describeDigestSigning({
      digestHex: `0x${digestHex.toUpperCase()}`,
      usedShareXs: [3, 1],
      publicKeyHex,
    });
    expect(prompt.title).toBe('Digest signing request');
    expect(prompt.digestHex).toBe(digestHex);
    expect(prompt.text).toContain(`Digest       ${digestHex}`);
    expect(prompt.text).toContain('Shares       3, 1');
    expect(prompt.text).toContain(`Public key   ${publicKeyHex}`);
  });

  it('rejects a digest that is not 32 bytes', () => {
    expect(() => describeDigestSigning({ digestHex: 'abcd' })).toThrow(/expected 32 bytes/);
    expect(() => describeDigestSigning({ digestHex: '' })).toThrow(/digestHex is required/);
  });
});

describe('describePersonalSigning', () => {
  it('lists kind, UTF-8 text, byte length, and the EIP-191 digest', () => {
    const prompt = describePersonalSigning({ text: 'Hello World' });
    const digest = bytesToHex(hashPersonalMessageText('Hello World'));
    expect(prompt.title).toBe('EIP-191 personal message');
    expect(prompt.digestHex).toBe(digest);
    expect(prompt.text).toContain('Kind         EIP-191 personal_sign');
    expect(prompt.text).toContain('Message      Hello World');
    expect(prompt.text).toContain('Bytes        11');
    expect(prompt.text).toContain(`Digest       ${digest}`);
    expect(Object.isFrozen(prompt)).toBe(true);
  });

  it('shows a hex payload preview instead of UTF-8', () => {
    const prompt = describePersonalSigning({ hex: '0x0a0b' });
    expect(prompt.text).toContain('Payload      0a0b');
    expect(prompt.text).toContain('Bytes        2');
    expect(prompt.text).not.toContain('Message');
  });
});

function mail(): TypedData {
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
      from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  };
}

describe('describeTypedDataSigning', () => {
  it('lists domain fields, primary type, and the EIP-712 digest', () => {
    const typedData = mail();
    const prompt = describeTypedDataSigning({ typedData });
    expect(prompt.title).toBe('EIP-712 typed data');
    expect(prompt.digestHex).toBe(typedDataDigestHex(typedData));
    expect(prompt.text).toContain('Kind         EIP-712 typed data');
    expect(prompt.text).toContain('Domain       Ether Mail');
    expect(prompt.text).toContain('Version      1');
    expect(prompt.text).toContain('Chain ID     1');
    expect(prompt.text).toContain('Contract     cccccccccccccccccccccccccccccccccccccccc');
    expect(prompt.text).toContain('Type         Mail');
    expect(prompt.text).toContain(`Digest       ${prompt.digestHex}`);
  });

  it('rejects a missing input object', () => {
    expect(() => describeTypedDataSigning(undefined as never)).toThrow(/must be an object/);
  });
});
