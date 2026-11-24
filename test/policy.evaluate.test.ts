import { describe, it, expect } from 'vitest';
import { evaluatePolicy, evaluateSpendLimits, matchingLimit, type Policy, type SignRequest } from '../src/policy';

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

function req(overrides: Partial<SignRequest> = {}): SignRequest {
  return {
    asset: 'ETH',
    value: '50',
    approvals: ['alice', 'bob'],
    ...overrides,
  };
}

describe('matchingLimit', () => {
  it('prefers an exact ticker over the catch-all', () => {
    expect(matchingLimit(policy, 'ETH')?.maxValue).toBe('100');
    expect(matchingLimit(policy, 'BTC')?.asset).toBe('*');
  });
});

describe('evaluatePolicy', () => {
  it('allows a 2-of-3 ETH transfer under the ETH cap', () => {
    const decision = evaluatePolicy(policy, req());
    expect(decision.allowed).toBe(true);
    expect(decision.approvalCount).toBe(2);
    expect(decision.matchedLimit?.asset).toBe('ETH');
    expect(decision.reasons).toEqual([]);
  });

  it('denies when fewer listed signers have approved than the threshold', () => {
    const decision = evaluatePolicy(policy, req({ approvals: ['alice'] }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('insufficient-approvals');
  });

  it('denies an unknown signer even if the threshold is otherwise met', () => {
    const decision = evaluatePolicy(policy, req({ approvals: ['alice', 'mallory'] }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('unknown-signer');
  });

  it('denies duplicate approvals from the same signer', () => {
    const decision = evaluatePolicy(policy, req({ approvals: ['alice', 'alice'] }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('duplicate-approval');
  });

  it('denies when the amount is above the matched limit', () => {
    const overEth = evaluatePolicy(policy, req({ value: '101' }));
    expect(overEth.allowed).toBe(false);
    expect(overEth.reasons[0].code).toBe('limit-exceeded');
    expect(overEth.matchedLimit?.asset).toBe('ETH');

    const overCatchAll = evaluatePolicy(policy, req({ asset: 'BTC', value: '11' }));
    expect(overCatchAll.allowed).toBe(false);
    expect(overCatchAll.reasons[0].code).toBe('limit-exceeded');
    expect(overCatchAll.matchedLimit?.asset).toBe('*');
  });

  it('denies an asset with no limit when the policy has no catch-all', () => {
    const tight: Policy = { ...policy, limits: [{ asset: 'ETH', maxValue: '1' }] };
    const decision = evaluatePolicy(tight, req({ asset: 'BTC', value: '1' }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('no-matching-limit');
  });

  it('denies a malformed request without throwing', () => {
    const decision = evaluatePolicy(policy, req({ value: '01' }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('invalid-request');
  });
});

describe('evaluateSpendLimits', () => {
  it('checks the cap and destination without requiring approvals', () => {
    const gated: Policy = {
      ...policy,
      limits: [{ asset: 'ETH', maxValue: '100', allowTo: ['bb22'] }],
    };
    expect(evaluateSpendLimits(gated, { asset: 'ETH', value: '50', to: 'bb22' }).allowed).toBe(true);
    expect(evaluateSpendLimits(gated, { asset: 'ETH', value: '101', to: 'bb22' }).reasons[0].code).toBe(
      'limit-exceeded'
    );
    expect(evaluateSpendLimits(gated, { asset: 'ETH', value: '50', to: 'aa11' }).reasons[0].code).toBe(
      'destination-not-allowed'
    );
  });
});
