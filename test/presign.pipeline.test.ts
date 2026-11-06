import { describe, expect, it } from 'vitest';
import { runPreSign } from '../src/presign';
import type { Policy } from '../src/policy';
import type { Transaction } from '../src/tx';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [
    { asset: 'ETH', maxValue: '100' },
    { asset: '*', maxValue: '10' },
  ],
};

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa',
    to: 'bb',
    value: '50',
    data: '',
    ...overrides,
  };
}

describe('runPreSign', () => {
  it('allows a valid transfer that meets the policy threshold and cap', () => {
    const result = runPreSign({
      tx: tx({ from: '0xAA' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(true);
    expect(result.tx?.from).toBe('aa');
    expect(result.policy?.allowed).toBe(true);
    expect(result.policy?.approvalCount).toBe(2);
    expect(result.reasons).toEqual([]);
  });

  it('stops on a malformed transaction without evaluating policy', () => {
    const result = runPreSign({
      tx: tx({ value: '01' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.tx).toBeUndefined();
    expect(result.policy).toBeUndefined();
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatchObject({ stage: 'transaction', code: 'invalid-transaction' });
  });

  it('denies when approvals fall short of the threshold', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice'],
    });
    expect(result.ok).toBe(false);
    expect(result.tx?.value).toBe('50');
    expect(result.reasons[0]).toMatchObject({
      stage: 'policy',
      code: 'insufficient-approvals',
    });
  });

  it('denies when the transfer value exceeds the matched spend cap', () => {
    const result = runPreSign({
      tx: tx({ value: '101' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons[0].code).toBe('limit-exceeded');
    expect(result.policy?.matchedLimit?.asset).toBe('ETH');
  });

  it('uses the frozen transaction value, not a separate request amount', () => {
    const result = runPreSign({
      tx: tx({ value: '10' }),
      policy,
      asset: 'BTC',
      approvals: ['alice', 'carol'],
    });
    expect(result.ok).toBe(true);
    expect(result.policy?.matchedLimit?.asset).toBe('*');
  });

  it('returns an invalid-policy reason instead of throwing on a broken policy', () => {
    const broken = { ...policy, threshold: 0 };
    const result = runPreSign({
      tx: tx(),
      policy: broken,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatchObject({ stage: 'policy', code: 'invalid-policy' });
  });

  it('rejects a missing input object', () => {
    const result = runPreSign(undefined as never);
    expect(result.ok).toBe(false);
    expect(result.reasons[0].code).toBe('invalid-input');
  });
});
