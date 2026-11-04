import type { Policy } from './types.js';
import { freezePolicy, isPolicyId } from './validate.js';

/**
 * Process-local policy map. Entries are frozen copies so later mutations
 * of a caller-owned object cannot change what the store holds.
 */
export class MemoryPolicyStore {
  private readonly policies = new Map<string, Policy>();

  get size(): number {
    return this.policies.size;
  }

  has(id: string): boolean {
    return this.policies.has(id);
  }

  get(id: string): Policy | undefined {
    if (!isPolicyId(id)) {
      throw new Error('policy id is not valid');
    }
    return this.policies.get(id);
  }

  /** Insert or replace. Returns true when an existing policy was overwritten. */
  upsert(policy: Policy): boolean {
    const frozen = freezePolicy(policy);
    const existed = this.policies.has(frozen.id);
    this.policies.set(frozen.id, frozen);
    return existed;
  }

  delete(id: string): boolean {
    if (!isPolicyId(id)) {
      throw new Error('policy id is not valid');
    }
    return this.policies.delete(id);
  }

  /** Snapshot of stored policies, sorted by id. */
  list(): Policy[] {
    return [...this.policies.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  clear(): void {
    this.policies.clear();
  }
}
