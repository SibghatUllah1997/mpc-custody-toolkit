import { describe, expect, it } from 'vitest';
import { transactionDigest, type Transaction } from '../src/tx';
import { bytesToHex } from '../src/utils/bytes';

function sample(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa11',
    to: 'bb22',
    value: '250',
    data: '0abc',
    ...overrides,
  };
}

describe('transactionDigest', () => {
  it('is 32 bytes and stable for equivalent hex prefixes and key order', () => {
    const a = transactionDigest(sample({ from: '0xAA11', to: '0xBB22' }));
    const b = transactionDigest({ data: '0x0ABC', value: '250', to: 'bb22', from: 'aa11' });
    expect(a.length).toBe(32);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it('changes when any field changes', () => {
    const base = bytesToHex(transactionDigest(sample()));
    expect(bytesToHex(transactionDigest(sample({ value: '251' })))).not.toBe(base);
    expect(bytesToHex(transactionDigest(sample({ to: 'bb23' })))).not.toBe(base);
    expect(bytesToHex(transactionDigest(sample({ data: '0abd' })))).not.toBe(base);
  });

  it('rejects the same malformed inputs as validation', () => {
    expect(() => transactionDigest(sample({ value: '01' }))).toThrow(/decimal integer/);
    expect(() => transactionDigest(sample({ from: '' }))).toThrow(/from/);
  });
});
