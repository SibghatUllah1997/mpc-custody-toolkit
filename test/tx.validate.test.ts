import { describe, expect, it } from 'vitest';
import {
  freezeTransaction,
  isAddressHex,
  validateTransaction,
  type Transaction,
} from '../src/tx';

function sample(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: '0x11',
    to: '0x22',
    value: '100',
    data: '',
    ...overrides,
  };
}

describe('transaction address and data shape', () => {
  it('accepts 1- to 32-byte hex addresses with or without 0x', () => {
    expect(isAddressHex('aa')).toBe(true);
    expect(isAddressHex('0xAA')).toBe(true);
    expect(isAddressHex('11'.repeat(32))).toBe(true);
  });

  it('rejects empty, odd-length, oversized, and non-hex addresses', () => {
    expect(isAddressHex('')).toBe(false);
    expect(isAddressHex('a')).toBe(false);
    expect(isAddressHex('11'.repeat(33))).toBe(false);
    expect(isAddressHex('zz')).toBe(false);
  });
});

describe('validateTransaction / freezeTransaction', () => {
  it('normalizes hex and returns a frozen copy', () => {
    const frozen = freezeTransaction(sample({ from: '0xAA', to: 'BB', data: '0x0abc' }));
    expect(frozen.from).toBe('aa');
    expect(frozen.to).toBe('bb');
    expect(frozen.data).toBe('0abc');
    expect(frozen.value).toBe('100');
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(() => validateTransaction(frozen)).not.toThrow();
  });

  it('treats missing data as empty calldata', () => {
    const input = { from: 'aa', to: 'bb', value: '0' } as Transaction;
    expect(freezeTransaction(input).data).toBe('');
  });

  it('ignores later mutations of the input object', () => {
    const input = sample();
    const frozen = freezeTransaction(input);
    input.from = 'ff';
    input.value = '9';
    expect(frozen.from).toBe('11');
    expect(frozen.value).toBe('100');
  });

  it('rejects a non-canonical value and a missing from field', () => {
    expect(() => validateTransaction(sample({ value: '01' }))).toThrow(/decimal integer/);
    expect(() => validateTransaction(sample({ value: '-1' }))).toThrow(/decimal integer/);
    expect(() => validateTransaction(sample({ from: '' }))).toThrow(/from/);
  });

  it('rejects odd-length data and oversized addresses', () => {
    expect(() => validateTransaction(sample({ data: 'abc' }))).toThrow(/even number/);
    expect(() => validateTransaction(sample({ to: '11'.repeat(33) }))).toThrow(/to must be 1\.\.32 bytes/);
  });
});
