import { describe, expect, it } from 'vitest';
import { simulateTransaction } from '../src/sim';
import type { Transaction } from '../src/tx';

function sample(overrides: Partial<Transaction> = {}): Transaction {
  return { from: 'aa11', to: 'bb22', value: '1000', data: '', ...overrides };
}

describe('simulateTransaction', () => {
  it('estimates gas, fee and total for a plain transfer', () => {
    const r = simulateTransaction(sample(), { gasPrice: '2' });
    expect(r).toEqual({
      dataBytes: 0,
      zeroBytes: 0,
      nonZeroBytes: 0,
      gasUnits: '21000',
      fee: '42000',
      total: '43000',
    });
  });

  it('prices calldata by byte kind', () => {
    const r = simulateTransaction(sample({ data: '00ff00' }), { gasPrice: '1' });
    expect(r.dataBytes).toBe(3);
    expect(r.gasUnits).toBe('21024');
    expect(r.total).toBe('22024');
  });

  it('is deterministic and does not mutate the transaction', () => {
    const tx = sample({ data: '0xAB00' });
    const copy = { ...tx };
    const a = simulateTransaction(tx, { gasPrice: '7' });
    const b = simulateTransaction(tx, { gasPrice: '7' });
    expect(a).toEqual(b);
    expect(tx).toEqual(copy);
  });

  it('reports headroom when the value is within the limit', () => {
    const r = simulateTransaction(sample(), { gasPrice: '1', limit: { asset: 'ETH', maxValue: '1500' } });
    expect(r.limit).toEqual({
      asset: 'ETH',
      maxValue: '1500',
      counted: '1000',
      withinLimit: true,
      headroom: '500',
      excess: '0',
    });
  });

  it('allows a value exactly at the limit', () => {
    const r = simulateTransaction(sample(), { gasPrice: '0', limit: { asset: '*', maxValue: '1000' } });
    expect(r.limit?.withinLimit).toBe(true);
    expect(r.limit?.headroom).toBe('0');
  });

  it('reports the excess when the value is over the limit', () => {
    const r = simulateTransaction(sample(), { gasPrice: '1', limit: { asset: 'ETH', maxValue: '900' } });
    expect(r.limit?.withinLimit).toBe(false);
    expect(r.limit?.excess).toBe('100');
    expect(r.limit?.headroom).toBe('0');
  });

  it('can count the fee toward the limit', () => {
    const limit = { asset: 'ETH', maxValue: '30000' };
    const tx = sample({ value: '1000' });
    expect(simulateTransaction(tx, { gasPrice: '1', limit }).limit?.withinLimit).toBe(true);
    const strict = simulateTransaction(tx, { gasPrice: '2', limit, includeFeeInLimit: true });
    expect(strict.limit?.counted).toBe('43000');
    expect(strict.limit?.withinLimit).toBe(false);
    expect(strict.limit?.excess).toBe('13000');
  });

  it('handles values beyond Number precision', () => {
    const big = '9'.repeat(40);
    const r = simulateTransaction(sample({ value: big }), { gasPrice: '1' });
    expect(r.total).toBe((BigInt(big) + 21000n).toString());
  });

  it('uses a custom cost model', () => {
    const r = simulateTransaction(sample({ data: '01' }), {
      gasPrice: '3',
      model: { baseGas: '100', zeroByteGas: '1', nonZeroByteGas: '5' },
    });
    expect(r.gasUnits).toBe('105');
    expect(r.fee).toBe('315');
  });

  it('rejects bad inputs', () => {
    expect(() => simulateTransaction(sample(), { gasPrice: '1.5' })).toThrow();
    expect(() => simulateTransaction(sample(), { gasPrice: '-1' })).toThrow();
    expect(() => simulateTransaction(sample({ value: '1e3' }), { gasPrice: '1' })).toThrow();
    expect(() => simulateTransaction(sample({ to: 'xyz' }), { gasPrice: '1' })).toThrow();
    expect(() => simulateTransaction(sample(), { gasPrice: '1', limit: { asset: 'ETH', maxValue: 'x' } })).toThrow();
    expect(() => simulateTransaction(sample(), undefined as never)).toThrow();
  });
});
