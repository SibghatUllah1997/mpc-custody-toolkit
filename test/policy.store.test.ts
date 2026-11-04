import { describe, it, expect } from 'vitest';
import { MemoryPolicyStore, type Policy } from '../src/policy';

function sample(id: string, name = id): Policy {
  return {
    id,
    name,
    signers: [{ id: 'alice' }, { id: 'bob' }],
    threshold: 2,
    limits: [{ asset: 'ETH', maxValue: '5' }],
  };
}

describe('MemoryPolicyStore', () => {
  it('inserts, lists by id, and returns frozen copies', () => {
    const store = new MemoryPolicyStore();
    const input = sample('vault-b', 'Beta');
    expect(store.upsert(input)).toBe(false);
    input.name = 'mutated';
    const got = store.get('vault-b');
    expect(got?.name).toBe('Beta');
    expect(Object.isFrozen(got)).toBe(true);
    expect(store.size).toBe(1);
    expect(store.has('vault-b')).toBe(true);
  });

  it('replaces an existing id and lists policies in id order', () => {
    const store = new MemoryPolicyStore();
    store.upsert(sample('vault-b'));
    store.upsert(sample('vault-a'));
    expect(store.upsert(sample('vault-b', 'Replaced'))).toBe(true);
    expect(store.list().map((p) => p.id)).toEqual(['vault-a', 'vault-b']);
    expect(store.get('vault-b')?.name).toBe('Replaced');
  });

  it('deletes by id and clears the whole map', () => {
    const store = new MemoryPolicyStore();
    store.upsert(sample('vault-a'));
    store.upsert(sample('vault-b'));
    expect(store.delete('vault-a')).toBe(true);
    expect(store.delete('vault-a')).toBe(false);
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
    expect(store.list()).toEqual([]);
  });

  it('rejects an invalid id on get and delete, and a malformed policy on upsert', () => {
    const store = new MemoryPolicyStore();
    expect(() => store.get('Nope')).toThrow(/not valid/);
    expect(() => store.delete('Nope')).toThrow(/not valid/);
    expect(() => store.upsert(sample('Nope'))).toThrow(/policy.id/);
  });
});
