import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  evaluateSpendLimits,
  freezePolicy,
  MemorySpendLedger,
  type Policy,
  type SignRequest,
} from '../src/policy';

const base: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '80', windowSeconds: 3600, maxWindowValue: '100' }],
};

function req(overrides: Partial<SignRequest> = {}): SignRequest {
  return {
    asset: 'ETH',
    value: '40',
    approvals: ['alice', 'bob'],
    ...overrides,
  };
}

describe('evaluatePolicy spend window', () => {
  it('allows a first transfer under the rolling cap', () => {
    const decision = evaluatePolicy(base, req(), undefined, { now: 1_000, history: [] });
    expect(decision.allowed).toBe(true);
    expect(decision.matchedLimit?.maxWindowValue).toBe('100');
  });

  it('denies when the rolling sum would exceed the window cap', () => {
    const spend = {
      now: 1_800,
      history: [{ asset: 'ETH', value: '70', at: 1_200 }],
    };
    const decision = evaluatePolicy(base, req(), undefined, spend);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('window-exceeded');
    expect(decision.matchedLimit?.asset).toBe('ETH');
  });

  it('ignores spends that have already left the window', () => {
    const spend = {
      now: 5_000,
      history: [{ asset: 'ETH', value: '70', at: 1_000 }],
    };
    expect(evaluatePolicy(base, req(), undefined, spend).allowed).toBe(true);
  });

  it('counts only the requested asset', () => {
    const spend = {
      now: 1_800,
      history: [{ asset: 'BTC', value: '70', at: 1_200 }],
    };
    expect(evaluatePolicy(base, req(), undefined, spend).allowed).toBe(true);
  });

  it('fails closed when a windowed limit is given no history', () => {
    const decision = evaluatePolicy(base, req());
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('spend-history-required');
  });

  it('counts a future-dated spend as recent', () => {
    const spend = {
      now: 1_000,
      history: [{ asset: 'ETH', value: '70', at: 1_500 }],
    };
    const decision = evaluatePolicy(base, req(), undefined, spend);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('window-exceeded');
  });
});

describe('evaluateSpendLimits spend window', () => {
  it('applies the same rolling cap without approvals', () => {
    const spend = {
      now: 100,
      history: [{ asset: 'ETH', value: '90', at: 50 }],
    };
    expect(evaluateSpendLimits(base, { asset: 'ETH', value: '5' }, spend).allowed).toBe(true);
    expect(evaluateSpendLimits(base, { asset: 'ETH', value: '11' }, spend).reasons[0].code).toBe(
      'window-exceeded'
    );
  });
});

describe('MemorySpendLedger', () => {
  it('feeds evaluatePolicy and prunes old events', () => {
    const ledger = new MemorySpendLedger();
    ledger.record('ETH', '40', 1_000);
    expect(ledger.size).toBe(1);
    expect(evaluatePolicy(base, req(), undefined, ledger.activity(1_200)).allowed).toBe(true);
    ledger.record('ETH', '40', 1_200);
    expect(evaluatePolicy(base, req(), undefined, ledger.activity(1_300)).reasons[0].code).toBe(
      'window-exceeded'
    );
    expect(ledger.prune(1_150)).toBe(1);
    expect(ledger.size).toBe(1);
    expect(evaluatePolicy(base, req(), undefined, ledger.activity(1_300)).allowed).toBe(true);
  });

  it('rejects a bad asset or time', () => {
    const ledger = new MemorySpendLedger();
    expect(() => ledger.record('eth', '1', 0)).toThrow(/asset/);
    expect(() => ledger.record('ETH', '01', 0)).toThrow(/decimal integer/);
    expect(() => ledger.record('ETH', '1', -1)).toThrow(/seconds/);
  });
});

describe('freezePolicy window fields', () => {
  it('copies the rolling cap onto the frozen limit', () => {
    const frozen = freezePolicy(base);
    expect(frozen.limits[0].windowSeconds).toBe(3600);
    expect(frozen.limits[0].maxWindowValue).toBe('100');
    base.limits[0].maxWindowValue = '1';
    expect(frozen.limits[0].maxWindowValue).toBe('100');
  });
});
