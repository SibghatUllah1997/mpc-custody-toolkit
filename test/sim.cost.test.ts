import { describe, expect, it } from 'vitest';
import { countDataBytes, DEFAULT_COST_MODEL, estimateGas, validateCostModel } from '../src/sim';

describe('countDataBytes', () => {
  it('returns zero counts for empty or missing data', () => {
    expect(countDataBytes('')).toEqual({ zero: 0, nonZero: 0 });
    expect(countDataBytes(undefined)).toEqual({ zero: 0, nonZero: 0 });
  });

  it('splits zero and non-zero bytes, ignoring prefix and case', () => {
    expect(countDataBytes('0x00ff0000AB')).toEqual({ zero: 3, nonZero: 2 });
  });

  it('rejects malformed hex', () => {
    expect(() => countDataBytes('abc')).toThrow();
    expect(() => countDataBytes('zz')).toThrow();
  });
});

describe('estimateGas', () => {
  it('charges only the base for empty data', () => {
    expect(estimateGas({ zero: 0, nonZero: 0 }, DEFAULT_COST_MODEL)).toBe(21000n);
  });

  it('adds per-byte costs from the model', () => {
    // 21000 + 3*4 + 2*16
    expect(estimateGas({ zero: 3, nonZero: 2 }, DEFAULT_COST_MODEL)).toBe(21044n);
    expect(estimateGas({ zero: 1, nonZero: 1 }, { baseGas: '10', zeroByteGas: '1', nonZeroByteGas: '2' })).toBe(13n);
  });

  it('rejects non-canonical model values', () => {
    expect(() => validateCostModel({ baseGas: '-1', zeroByteGas: '4', nonZeroByteGas: '16' })).toThrow();
    expect(() => validateCostModel({ baseGas: '01', zeroByteGas: '4', nonZeroByteGas: '16' })).toThrow();
    expect(() => validateCostModel({ baseGas: '1', zeroByteGas: '4' } as never)).toThrow();
  });
});
