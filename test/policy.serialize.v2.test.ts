import { describe, it, expect } from 'vitest';
import {
  computePoliciesDigestHex,
  decodeStore,
  encodeStore,
  MemoryPolicyStore,
  POLICY_STORE_TYPE,
  POLICY_STORE_VERSION,
  type Policy,
} from '../src/policy';
import { SchemaError } from '../src/schema';

const policy: Policy = {
  id: 'treasury',
  name: 'Treasury',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '10' }],
};

function storeWith(...ps: Policy[]): MemoryPolicyStore {
  const s = new MemoryPolicyStore();
  for (const p of ps) s.upsert(p);
  return s;
}

describe('policy store snapshot v2', () => {
  it('writes v2 with a sha256 digest over the sorted policy list', () => {
    const snap = JSON.parse(encodeStore(storeWith(policy)));
    expect(snap.version).toBe(POLICY_STORE_VERSION);
    expect(snap.digest.algo).toBe('sha256');
    expect(snap.digest.hex).toBe(computePoliciesDigestHex(snap.policies));
    expect(decodeStore(JSON.stringify(snap)).get('treasury')?.threshold).toBe(2);
  });

  it('detects a hand-edited limit', () => {
    const snap = JSON.parse(encodeStore(storeWith(policy)));
    snap.policies[0].limits[0].maxValue = '1000000';
    expect(() => decodeStore(JSON.stringify(snap))).toThrow(/digest mismatch/);
  });

  it('requires the digest on v2 but not on v1', () => {
    const v2 = JSON.parse(encodeStore(storeWith(policy)));
    delete v2.digest;
    expect(() => decodeStore(JSON.stringify(v2))).toThrow(/missing policy store digest/);
    const v1 = { version: 1, type: POLICY_STORE_TYPE, policies: [policy] };
    expect(decodeStore(JSON.stringify(v1)).get('treasury')?.name).toBe('Treasury');
  });

  it('re-encodes an upgraded v1 store as v2', () => {
    const v1 = { version: 1, type: POLICY_STORE_TYPE, policies: [policy] };
    const again = JSON.parse(encodeStore(decodeStore(JSON.stringify(v1))));
    expect(again.version).toBe(2);
    expect(again.policies).toEqual([policy]);
  });

  it('flags snapshots from a newer toolkit', () => {
    try {
      decodeStore(JSON.stringify({ version: 9, type: POLICY_STORE_TYPE, policies: [] }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError);
      expect((e as SchemaError).code).toBe('newer-version');
    }
  });
});
