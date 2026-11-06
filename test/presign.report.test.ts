import { describe, expect, it } from 'vitest';
import { buildPreSignReport, runPreSign } from '../src/presign';
import type { Policy } from '../src/policy';
import type { Transaction } from '../src/tx';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100' }],
};

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa',
    to: 'bb',
    value: '40',
    data: '',
    ...overrides,
  };
}

describe('buildPreSignReport', () => {
  it('summarizes a successful run as ready with gas, fee, and approval count', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      gasPrice: '2',
    });
    const report = buildPreSignReport(result);
    expect(report.ready).toBe(true);
    expect(report.stages).toEqual({
      transaction: 'pass',
      policy: 'pass',
      simulation: 'pass',
    });
    expect(report.summary).toBe('ready: 21000 gas, fee 42000, 2 approvals');
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.stages)).toBe(true);
  });

  it('treats a policy-only success as ready when simulation was not requested', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    const report = buildPreSignReport(result);
    expect(report.ready).toBe(true);
    expect(report.stages.simulation).toBe('skipped');
    expect(report.summary).toBe('ready: 2 approvals');
  });

  it('marks later stages skipped when the transaction itself is invalid', () => {
    const result = runPreSign({
      tx: tx({ value: '01' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      gasPrice: '1',
    });
    const report = buildPreSignReport(result);
    expect(report.ready).toBe(false);
    expect(report.stages).toEqual({
      transaction: 'fail',
      policy: 'skipped',
      simulation: 'skipped',
    });
    expect(report.summary).toBe('blocked: transaction:invalid-transaction');
  });

  it('lists every failed stage in the summary', () => {
    const result = runPreSign({
      tx: tx({ value: '101' }),
      policy,
      asset: 'ETH',
      approvals: ['alice'],
      gasPrice: '1',
      includeFeeInLimit: true,
    });
    const report = buildPreSignReport(result);
    expect(report.ready).toBe(false);
    expect(report.stages.policy).toBe('fail');
    expect(report.stages.simulation).toBe('fail');
    expect(report.summary).toBe('blocked: policy:insufficient-approvals, simulation:fee-limit-exceeded');
  });

  it('treats an incomplete result with no reasons as blocked', () => {
    const report = buildPreSignReport({ ok: false, reasons: [] });
    expect(report.ready).toBe(false);
    expect(report.stages).toEqual({
      transaction: 'skipped',
      policy: 'skipped',
      simulation: 'skipped',
    });
    expect(report.summary).toBe('blocked: incomplete pre-sign result');
  });
});
