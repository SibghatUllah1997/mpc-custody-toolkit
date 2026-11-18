import { describe, expect, it } from 'vitest';
import {
  decodeStore,
  encodeStore,
  evaluatePolicy,
  freezePolicy,
  isDestinationHex,
  MAX_DESTINATIONS,
  MemoryPolicyStore,
  normalizeDestination,
  validatePolicy,
  type Policy,
  type SignRequest,
} from '../src/policy';

const treasury = 'aa11';
const exchange = 'bb22';
const unknown = 'cc33';

function sample(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'vault-main',
    name: 'Main vault',
    signers: [{ id: 'alice' }, { id: 'bob' }],
    threshold: 2,
    limits: [
      {
        asset: 'ETH',
        maxValue: '100',
        allowTo: [treasury, '0xBB22'],
        denyTo: ['dd44'],
      },
    ],
    ...overrides,
  };
}

function req(overrides: Partial<SignRequest> = {}): SignRequest {
  return {
    asset: 'ETH',
    value: '50',
    approvals: ['alice', 'bob'],
    to: treasury,
    ...overrides,
  };
}

describe('destination address helpers', () => {
  it('normalizes 0x prefixes and rejects odd-length hex', () => {
    expect(normalizeDestination('0xAA11', 'to')).toBe('aa11');
    expect(isDestinationHex('bb22')).toBe(true);
    expect(isDestinationHex('xyz')).toBe(false);
    expect(() => normalizeDestination('1', 'to')).toThrow(/even number/);
  });
});

describe('destination list validation', () => {
  it('accepts a limit with allow and deny lists and freezes canonical copies', () => {
    const frozen = freezePolicy(sample());
    expect(frozen.limits[0].allowTo).toEqual([treasury, exchange]);
    expect(frozen.limits[0].denyTo).toEqual(['dd44']);
    expect(Object.isFrozen(frozen.limits[0].allowTo)).toBe(true);
  });

  it('rejects duplicate destinations, overlap, and an over-long list', () => {
    expect(() =>
      validatePolicy(sample({ limits: [{ asset: 'ETH', maxValue: '1', allowTo: ['aa11', '0xAA11'] }] }))
    ).toThrow(/duplicate destination/);
    expect(() =>
      validatePolicy(
        sample({
          limits: [{ asset: 'ETH', maxValue: '1', allowTo: ['aa11'], denyTo: ['0xAA11'] }],
        })
      )
    ).toThrow(/both allowed and denied/);
    expect(() =>
      validatePolicy(
        sample({
          limits: [
            {
              asset: 'ETH',
              maxValue: '1',
              allowTo: Array.from({ length: MAX_DESTINATIONS + 1 }, (_, i) =>
                (i + 1).toString(16).padStart(2, '0')
              ),
            },
          ],
        })
      )
    ).toThrow(/at most/);
  });
});

describe('evaluatePolicy destination checks', () => {
  it('allows a destination on the allow list', () => {
    const decision = evaluatePolicy(sample(), req({ to: '0xBB22' }));
    expect(decision.allowed).toBe(true);
  });

  it('denies a destination missing from the allow list', () => {
    const decision = evaluatePolicy(sample(), req({ to: unknown }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('destination-not-allowed');
  });

  it('denies a destination on the deny list', () => {
    const policy = sample({
      limits: [{ asset: 'ETH', maxValue: '100', denyTo: ['dd44'] }],
    });
    const decision = evaluatePolicy(policy, req({ to: 'dd44' }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('destination-denied');
  });

  it('requires a destination when the matched limit has lists', () => {
    const decision = evaluatePolicy(sample(), req({ to: undefined }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('destination-required');
  });

  it('rejects a malformed destination even without lists', () => {
    const plain: Policy = {
      ...sample(),
      limits: [{ asset: 'ETH', maxValue: '100' }],
    };
    const decision = evaluatePolicy(plain, req({ to: 'zz' }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('invalid-request');
  });

  it('treats an empty allow list as deny-all', () => {
    const policy = sample({
      limits: [{ asset: 'ETH', maxValue: '100', allowTo: [] }],
    });
    const decision = evaluatePolicy(policy, req({ to: treasury }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0].code).toBe('destination-not-allowed');
  });
});

describe('policy store round-trip of destination lists', () => {
  it('keeps allowTo and denyTo through encode/decode', () => {
    const store = new MemoryPolicyStore();
    store.upsert(sample());
    const back = decodeStore(encodeStore(store)).get('vault-main');
    expect(back?.limits[0].allowTo).toEqual([treasury, exchange]);
    expect(back?.limits[0].denyTo).toEqual(['dd44']);
  });
});
