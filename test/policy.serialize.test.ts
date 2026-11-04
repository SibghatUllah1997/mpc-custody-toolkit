import { describe, it, expect } from 'vitest';
import {
  decodeStore,
  encodeStore,
  MemoryPolicyStore,
  POLICY_STORE_TYPE,
  type Policy,
} from '../src/policy';

function sample(id: string, name = id): Policy {
  return {
    id,
    name,
    signers: [{ id: 'alice' }, { id: 'bob' }],
    threshold: 2,
    limits: [{ asset: 'ETH', maxValue: '5' }],
  };
}

describe('policy store JSON', () => {
  it('roundtrips an empty store and a store with several policies', () => {
    const empty = encodeStore(new MemoryPolicyStore());
    const emptyBack = decodeStore(empty);
    expect(emptyBack.size).toBe(0);
    expect(JSON.parse(empty)).toMatchObject({ version: 1, type: POLICY_STORE_TYPE, policies: [] });

    const store = new MemoryPolicyStore();
    store.upsert(sample('vault-b', 'Beta'));
    store.upsert(sample('vault-a', 'Alpha'));
    const json = encodeStore(store);
    const parsed = JSON.parse(json);
    expect(parsed.policies.map((p: Policy) => p.id)).toEqual(['vault-a', 'vault-b']);
    const back = decodeStore(json);
    expect(back.list().map((p) => p.name)).toEqual(['Alpha', 'Beta']);
    expect(back.get('vault-a')?.limits[0].maxValue).toBe('5');
  });

  it('keeps the decoded store independent of later upserts on the source', () => {
    const store = new MemoryPolicyStore();
    store.upsert(sample('vault-a', 'Alpha'));
    const json = encodeStore(store);
    store.upsert(sample('vault-a', 'Changed'));
    expect(decodeStore(json).get('vault-a')?.name).toBe('Alpha');
  });

  it('rejects invalid JSON, unknown versions, and duplicate ids', () => {
    expect(() => decodeStore('not json')).toThrow(/Invalid JSON/);
    expect(() => decodeStore(JSON.stringify({ version: 2, type: POLICY_STORE_TYPE, policies: [] }))).toThrow(
      /unsupported policy store version/
    );
    expect(() => decodeStore(JSON.stringify({ version: 1, type: 'other', policies: [] }))).toThrow(
      /unsupported policy store type/
    );
    const dup = {
      version: 1,
      type: POLICY_STORE_TYPE,
      policies: [sample('vault-a'), sample('vault-a', 'Other')],
    };
    expect(() => decodeStore(JSON.stringify(dup))).toThrow(/duplicate policy id/);
  });

  it('rejects a nested policy that fails validation', () => {
    const bad = {
      version: 1,
      type: POLICY_STORE_TYPE,
      policies: [{ ...sample('vault-a'), threshold: 9 }],
    };
    expect(() => decodeStore(JSON.stringify(bad))).toThrow(/threshold/);
  });
});
