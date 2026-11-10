import { sha256 } from '@noble/hashes/sha256';
import { MemoryPolicyStore } from './store.js';
import type { Policy } from './types.js';
import { bytesToHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';

export const POLICY_STORE_TYPE = 'policy-store' as const;
/** Version written by `encodeStore`. */
export const POLICY_STORE_VERSION = 2 as const;

export type PolicyStoreSnapshotV1 = {
  version: 1;
  type: typeof POLICY_STORE_TYPE;
  policies: Policy[];
};

/** v2 adds a digest over the canonical policy list so edits made by hand are caught. */
export type PolicyStoreSnapshotV2 = {
  version: 2;
  type: typeof POLICY_STORE_TYPE;
  policies: Policy[];
  digest: { algo: 'sha256'; hex: string };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function computePoliciesDigestHex(policies: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(stableStringify(policies))));
}

export const POLICY_STORE_SCHEMA: SchemaSpec = {
  type: POLICY_STORE_TYPE,
  label: 'policy store',
  minVersion: 1,
  currentVersion: POLICY_STORE_VERSION,
  migrations: {
    // v1 had no digest; seal whatever was read so the v2 check below passes.
    1: (doc) => ({ policies: doc.policies, digest: { algo: 'sha256', hex: computePoliciesDigestHex(doc.policies) } }),
  },
};

export function encodeStore(store: MemoryPolicyStore): string {
  const policies = store.list();
  const snapshot: PolicyStoreSnapshotV2 = {
    version: POLICY_STORE_VERSION,
    type: POLICY_STORE_TYPE,
    policies,
    digest: { algo: 'sha256', hex: computePoliciesDigestHex(policies) },
  };
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Rebuild a store from a v1 or v2 snapshot. v1 files are upgraded first.
 * Each policy is re-validated; duplicate ids fail.
 */
export function decodeStore(json: string): MemoryPolicyStore {
  const { doc: snap } = upgradeDocument(parseDocument(json), POLICY_STORE_SCHEMA);
  assert(Array.isArray(snap.policies), 'policies must be an array');
  const digest = snap.digest as { algo?: unknown; hex?: unknown } | undefined;
  assert(digest !== null && typeof digest === 'object', 'missing policy store digest');
  assert(digest.algo === 'sha256', 'unsupported policy store digest algo');
  assert(typeof digest.hex === 'string', 'digest.hex must be a string');
  assert(digest.hex.toLowerCase() === computePoliciesDigestHex(snap.policies), 'policy store digest mismatch');
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
