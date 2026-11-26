import { describe, it, expect } from 'vitest';
import {
  addDecimalInteger,
  freezePolicy,
  isAssetCode,
  isPolicyId,
  isSignerId,
  parseDecimalInteger,
  validatePolicy,
  type Policy,
} from '../src/policy';

function sample(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'vault-main',
    name: 'Main vault',
    signers: [
      { id: 'alice', label: 'Alice' },
      { id: 'bob' },
      { id: 'carol' },
    ],
    threshold: 2,
    limits: [
      { asset: 'ETH', maxValue: '100' },
      { asset: '*', maxValue: '10' },
    ],
    ...overrides,
  };
}

describe('policy id / signer / asset shape', () => {
  it('accepts lowercase kebab ids and uppercase tickers', () => {
    expect(isPolicyId('vault-main')).toBe(true);
    expect(isPolicyId('a')).toBe(true);
    expect(isSignerId('alice')).toBe(true);
    expect(isSignerId('ops-1')).toBe(true);
    expect(isAssetCode('ETH')).toBe(true);
    expect(isAssetCode('*')).toBe(true);
  });

  it('rejects uppercase ids, empty strings, and lowercase tickers', () => {
    expect(isPolicyId('Vault')).toBe(false);
    expect(isPolicyId('')).toBe(false);
    expect(isSignerId('Alice')).toBe(false);
    expect(isAssetCode('eth')).toBe(false);
    expect(isAssetCode('')).toBe(false);
  });
});

describe('parseDecimalInteger', () => {
  it('parses canonical non-negative integers', () => {
    expect(parseDecimalInteger('0', 'n')).toBe(0n);
    expect(parseDecimalInteger('100', 'n')).toBe(100n);
  });

  it('rejects leading zeros, signs, and empty input', () => {
    expect(() => parseDecimalInteger('01', 'n')).toThrow(/decimal integer/);
    expect(() => parseDecimalInteger('-1', 'n')).toThrow(/decimal integer/);
    expect(() => parseDecimalInteger('', 'n')).toThrow(/decimal integer/);
  });
});

describe('addDecimalInteger', () => {
  it('adds two canonical amounts', () => {
    expect(addDecimalInteger('0', '0')).toBe('0');
    expect(addDecimalInteger('50', '50')).toBe('100');
    expect(addDecimalInteger('999', '1')).toBe('1000');
  });
});

describe('validatePolicy', () => {
  it('accepts a well-formed 2-of-3 policy with per-asset limits', () => {
    expect(() => validatePolicy(sample())).not.toThrow();
  });

  it('rejects an empty signer list and a threshold above the signer count', () => {
    expect(() => validatePolicy(sample({ signers: [], threshold: 1 }))).toThrow(/signers/);
    expect(() => validatePolicy(sample({ threshold: 4 }))).toThrow(/threshold/);
  });

  it('rejects duplicate signer ids and duplicate limit assets', () => {
    expect(() =>
      validatePolicy(sample({ signers: [{ id: 'alice' }, { id: 'alice' }], threshold: 1 }))
    ).toThrow(/duplicate signer/);
    expect(() =>
      validatePolicy(
        sample({
          limits: [
            { asset: 'ETH', maxValue: '1' },
            { asset: 'ETH', maxValue: '2' },
          ],
        })
      )
    ).toThrow(/duplicate limit/);
  });

  it('rejects a non-canonical spend ceiling', () => {
    expect(() =>
      validatePolicy(sample({ limits: [{ asset: 'ETH', maxValue: '01' }] }))
    ).toThrow(/maxValue/);
  });

  it('accepts a rolling window when both fields are set', () => {
    expect(() =>
      validatePolicy(
        sample({
          limits: [{ asset: 'ETH', maxValue: '100', windowSeconds: 86400, maxWindowValue: '500' }],
        })
      )
    ).not.toThrow();
  });

  it('rejects a window with only one of the two fields', () => {
    expect(() =>
      validatePolicy(sample({ limits: [{ asset: 'ETH', maxValue: '100', windowSeconds: 60 }] }))
    ).toThrow(/must be set together/);
    expect(() =>
      validatePolicy(sample({ limits: [{ asset: 'ETH', maxValue: '100', maxWindowValue: '500' }] }))
    ).toThrow(/must be set together/);
  });
});

describe('freezePolicy', () => {
  it('returns a frozen copy that ignores later mutations of the input', () => {
    const input = sample();
    const frozen = freezePolicy(input);
    input.name = 'mutated';
    input.signers.push({ id: 'dave' });
    input.limits[0].maxValue = '999';
    expect(frozen.name).toBe('Main vault');
    expect(frozen.signers).toHaveLength(3);
    expect(frozen.limits[0].maxValue).toBe('100');
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.signers[0])).toBe(true);
  });
});
