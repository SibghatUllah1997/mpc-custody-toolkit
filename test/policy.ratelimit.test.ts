import { describe, expect, it } from 'vitest';
import {
  checkApprovalActivity,
  checkSignerRate,
  decodeStore,
  encodeStore,
  evaluatePolicy,
  freezePolicy,
  MemoryApprovalLedger,
  MemoryPolicyStore,
  validatePolicy,
  type Policy,
  type SignerRateLimit,
} from '../src/policy';
import { runPreSign } from '../src/presign';

const base: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100' }],
};

const withRate = (signerLimits: SignerRateLimit): Policy => ({ ...base, signerLimits });
const request = { asset: 'ETH', value: '10', approvals: ['alice', 'bob'] };

describe('signer rate limit validation', () => {
  it('accepts cooldown, window, or both and freezes a clean copy', () => {
    expect(() => validatePolicy(withRate({ cooldownSeconds: 60 }))).not.toThrow();
    expect(() => validatePolicy(withRate({ maxApprovals: 3, windowSeconds: 3600 }))).not.toThrow();
    const frozen = freezePolicy(withRate({ cooldownSeconds: 60, maxApprovals: 3, windowSeconds: 3600, extra: 1 } as SignerRateLimit));
    expect(frozen.signerLimits).toEqual({ cooldownSeconds: 60, maxApprovals: 3, windowSeconds: 3600 });
    expect(Object.isFrozen(frozen.signerLimits)).toBe(true);
  });

  it('rejects empty, partial, and out-of-range limits', () => {
    expect(() => validatePolicy(withRate({}))).toThrow(/must set/);
    expect(() => validatePolicy(withRate([] as unknown as SignerRateLimit))).toThrow(/object/);
    expect(() => validatePolicy(withRate({ cooldownSeconds: 0 }))).toThrow(/cooldownSeconds/);
    expect(() => validatePolicy(withRate({ cooldownSeconds: 1.5 }))).toThrow(/cooldownSeconds/);
    expect(() => validatePolicy(withRate({ maxApprovals: 3 }))).toThrow(/together/);
    expect(() => validatePolicy(withRate({ windowSeconds: 60 }))).toThrow(/together/);
    expect(() => validatePolicy(withRate({ maxApprovals: 0, windowSeconds: 60 }))).toThrow(/maxApprovals/);
    expect(() => validatePolicy(withRate({ maxApprovals: 2, windowSeconds: 31 * 86400 }))).toThrow(/windowSeconds/);
  });

  it('survives the policy store round-trip and digest', () => {
    const store = new MemoryPolicyStore();
    store.upsert(withRate({ cooldownSeconds: 30 }));
    const restored = decodeStore(encodeStore(store));
    expect(restored.get('vault-main')?.signerLimits).toEqual({ cooldownSeconds: 30 });
  });
});

describe('evaluatePolicy with signer limits', () => {
  it('fails closed when the policy needs activity and none is given', () => {
    const d = evaluatePolicy(withRate({ cooldownSeconds: 60 }), request);
    expect(d.allowed).toBe(false);
    expect(d.reasons[0].code).toBe('activity-required');
    expect(evaluatePolicy(base, request).allowed).toBe(true);
  });

  it('denies a signer inside the cooldown and allows after it', () => {
    const policy = withRate({ cooldownSeconds: 60 });
    const history = [{ signer: 'bob', at: 1000 }];
    const early = evaluatePolicy(policy, request, { now: 1030, history });
    expect(early.reasons[0]).toEqual({ code: 'signer-cooldown', message: 'signer bob is in cooldown for another 30s' });
    expect(evaluatePolicy(policy, request, { now: 1060, history }).allowed).toBe(true);
    expect(evaluatePolicy(policy, { ...request, approvals: ['alice', 'carol'] }, { now: 1030, history }).allowed).toBe(true);
  });

  it('counts approvals inside a sliding window', () => {
    const policy = withRate({ maxApprovals: 2, windowSeconds: 100 });
    const history = [
      { signer: 'alice', at: 900 },
      { signer: 'alice', at: 950 },
    ];
    const d = evaluatePolicy(policy, request, { now: 990, history });
    expect(d.reasons[0].code).toBe('signer-rate-limited');
    expect(d.approvalCount).toBe(2);
    expect(evaluatePolicy(policy, request, { now: 1000, history }).allowed).toBe(true);
  });

  it('treats future-dated events as recent', () => {
    const rate: SignerRateLimit = { cooldownSeconds: 10 };
    expect(checkSignerRate(rate, 'bob', { now: 100, history: [{ signer: 'bob', at: 500 }] })).toEqual({
      code: 'signer-cooldown',
      message: 'signer bob is in cooldown for another 10s',
    });
  });

  it('rejects malformed activity', () => {
    const policy = withRate({ cooldownSeconds: 60 });
    expect(evaluatePolicy(policy, request, { now: -1, history: [] }).reasons[0].code).toBe('invalid-request');
    expect(checkApprovalActivity(null)).toMatch(/object/);
    expect(checkApprovalActivity({ now: 1, history: {} })).toMatch(/array/);
    expect(checkApprovalActivity({ now: 1, history: [{ signer: 'a', at: 1.5 }] })).toMatch(/history\[0\]/);
    expect(checkApprovalActivity({ now: 1, history: new Array(10_001).fill({ signer: 'a', at: 1 }) })).toMatch(/at most/);
    expect(checkApprovalActivity({ now: 1, history: [] })).toBeUndefined();
  });
});

describe('MemoryApprovalLedger', () => {
  it('records allowed approvals and feeds them back into evaluation', () => {
    const policy = withRate({ cooldownSeconds: 60, maxApprovals: 2, windowSeconds: 3600 });
    const ledger = new MemoryApprovalLedger();
    let now = 10_000;
    const attempt = () => {
      const d = evaluatePolicy(policy, request, ledger.activity(now));
      if (d.allowed) ledger.record(request.approvals, now);
      return d;
    };
    expect(attempt().allowed).toBe(true);
    now += 30;
    expect(attempt().reasons[0].code).toBe('signer-cooldown');
    now += 30;
    expect(attempt().allowed).toBe(true);
    now += 60;
    expect(attempt().reasons[0].code).toBe('signer-rate-limited');
    expect(ledger.size).toBe(4);
    expect(ledger.prune(10_001)).toBe(2);
    expect(ledger.size).toBe(2);
    expect(() => ledger.record(['alice'], -5)).toThrow(/seconds/);
    expect(() => ledger.record([''], 5)).toThrow(/signer id/);
    expect(() => ledger.record('alice' as unknown as string[], 5)).toThrow(/array/);
  });
});

describe('pre-sign with signer limits', () => {
  it('passes activity through to the policy stage', () => {
    const tx = { from: 'aa', to: 'bb', value: '10', data: '' };
    const policy = withRate({ cooldownSeconds: 60 });
    const blocked = runPreSign({ tx, policy, asset: 'ETH', approvals: ['alice', 'bob'], activity: { now: 10, history: [{ signer: 'alice', at: 5 }] } });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons[0]).toMatchObject({ stage: 'policy', code: 'signer-cooldown' });
    const missing = runPreSign({ tx, policy, asset: 'ETH', approvals: ['alice', 'bob'] });
    expect(missing.reasons[0]).toMatchObject({ stage: 'policy', code: 'activity-required' });
    expect(runPreSign({ tx, policy, asset: 'ETH', approvals: ['alice', 'bob'], activity: { now: 100, history: [] } }).ok).toBe(true);
  });
});
