import { describe, expect, it } from 'vitest';
import {
  decodeTransaction,
  encodeTransaction,
  TX_TYPE,
  type Transaction,
} from '../src/tx';

function sample(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: '0xAA11',
    to: 'BB22',
    value: '250',
    data: '0x0abc',
    ...overrides,
  };
}

describe('transaction JSON envelope', () => {
  it('roundtrips a transfer and writes normalized hex', () => {
    const json = encodeTransaction(sample());
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      version: 1,
      type: TX_TYPE,
      tx: { from: 'aa11', to: 'bb22', value: '250', data: '0abc' },
    });
    const back = decodeTransaction(json);
    expect(back).toEqual({ from: 'aa11', to: 'bb22', value: '250', data: '0abc' });
    expect(Object.isFrozen(back)).toBe(true);
  });

  it('roundtrips empty calldata and a zero value', () => {
    const back = decodeTransaction(encodeTransaction(sample({ value: '0', data: '' })));
    expect(back.value).toBe('0');
    expect(back.data).toBe('');
  });

  it('keeps the decoded copy independent of later input mutation', () => {
    const input = sample();
    const json = encodeTransaction(input);
    input.value = '999';
    expect(decodeTransaction(json).value).toBe('250');
  });

  it('rejects invalid JSON, unknown versions, and a bad nested value', () => {
    expect(() => decodeTransaction('not json')).toThrow(/Invalid JSON/);
    expect(() =>
      decodeTransaction(JSON.stringify({ version: 2, type: TX_TYPE, tx: sample() }))
    ).toThrow(/unsupported transaction version/);
    expect(() =>
      decodeTransaction(JSON.stringify({ version: 1, type: 'other', tx: sample() }))
    ).toThrow(/unsupported transaction type/);
    expect(() =>
      decodeTransaction(
        JSON.stringify({ version: 1, type: TX_TYPE, tx: { ...sample(), value: '01' } })
      )
    ).toThrow(/decimal integer/);
  });
});
