import { MemoryPolicyStore } from './store.js';
import type { Policy } from './types.js';

export const POLICY_STORE_TYPE = 'policy-store' as const;

export type PolicyStoreSnapshotV1 = {
  version: 1;
  type: typeof POLICY_STORE_TYPE;
  policies: Policy[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function encodeStore(store: MemoryPolicyStore): string {
  const snapshot: PolicyStoreSnapshotV1 = {
    version: 1,
    type: POLICY_STORE_TYPE,
    policies: store.list(),
  };
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Rebuild a store from a v1 snapshot. Each policy is re-validated; duplicate ids fail.
 */
export function decodeStore(json: string): MemoryPolicyStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  assert(parsed !== null && typeof parsed === 'object', 'snapshot must be an object');
  const snap = parsed as Partial<PolicyStoreSnapshotV1>;
  assert(snap.version === 1, 'unsupported policy store version');
  assert(snap.type === POLICY_STORE_TYPE, 'unsupported policy store type');
  assert(Array.isArray(snap.policies), 'policies must be an array');
  const store = new MemoryPolicyStore();
  const seen = new Set<string>();
  for (const policy of snap.policies) {
    assert(policy && typeof policy === 'object', 'each policy must be an object');
    const id = (policy as Policy).id;
    assert(typeof id === 'string', 'policy.id must be a string');
    assert(!seen.has(id), `duplicate policy id in snapshot: ${id}`);
    seen.add(id);
    store.upsert(policy as Policy);
  }
  return store;
}
