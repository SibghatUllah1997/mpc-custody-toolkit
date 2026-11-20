import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import {
  assert,
  computeApprovalChecksumHex,
  isRecord,
} from './hash.js';
import { decodeApprovalItem, encodeSealedApprovalItem } from './item.js';
import {
  APPROVAL_QUEUE_TYPE,
  APPROVAL_QUEUE_VERSION,
  type ApprovalItem,
  type ApprovalQueue,
} from './types.js';

export const APPROVAL_QUEUE_SCHEMA: SchemaSpec = {
  type: APPROVAL_QUEUE_TYPE,
  label: 'approval queue',
  minVersion: 1,
  currentVersion: APPROVAL_QUEUE_VERSION,
  migrations: {},
};

function itemsChecksum(items: ApprovalItem[]): string {
  return computeApprovalChecksumHex(items.map((item) => item.data.id));
}

function sealQueue(items: ApprovalItem[]): ApprovalQueue {
  const sealed = items.map((item) => JSON.parse(encodeSealedApprovalItem(item)) as ApprovalItem);
  const ids = new Set<string>();
  for (const item of sealed) {
    assert(!ids.has(item.data.id), `duplicate approval item id: ${item.data.id}`);
    ids.add(item.data.id);
  }
  const sorted = sealed.slice().sort((a, b) => (a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0));
  return {
    version: APPROVAL_QUEUE_VERSION,
    type: APPROVAL_QUEUE_TYPE,
    items: sorted,
    checksum: { algo: 'sha256', hex: itemsChecksum(sorted) },
  };
}

export function encodeApprovalQueue(items: ApprovalItem[]): string {
  return JSON.stringify(sealQueue(items), null, 2);
}

export function decodeApprovalQueue(json: string): ApprovalQueue {
  const { doc } = upgradeDocument(parseDocument(json), APPROVAL_QUEUE_SCHEMA);
  assert(Array.isArray(doc.items), 'items must be an array');
  const checksum = doc.checksum;
  assert(isRecord(checksum), 'missing checksum');
  assert(checksum.algo === 'sha256', 'unsupported checksum algo');
  assert(typeof checksum.hex === 'string', 'checksum.hex must be a string');
  const items = doc.items.map((entry, i) => {
    assert(isRecord(entry), `items[${i}] must be an object`);
    return decodeApprovalItem(JSON.stringify(entry));
  });
  const sealed = sealQueue(items);
  assert(checksum.hex.toLowerCase() === sealed.checksum.hex, 'approval queue checksum mismatch');
  return sealed;
}

/**
 * Process-local map of pending items, keyed by id. Entries are resealed copies.
 */
export class MemoryApprovalQueue {
  private readonly items = new Map<string, ApprovalItem>();

  get size(): number {
    return this.items.size;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): ApprovalItem | undefined {
    return this.items.get(id);
  }

  /** Insert or replace. Returns true when an existing item was overwritten. */
  upsert(item: ApprovalItem): boolean {
    const sealed = decodeApprovalItem(encodeSealedApprovalItem(item));
    const existed = this.items.has(sealed.data.id);
    this.items.set(sealed.data.id, sealed);
    return existed;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  list(): ApprovalItem[] {
    return [...this.items.values()].sort((a, b) => (a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0));
  }

  clear(): void {
    this.items.clear();
  }

  toJSON(): string {
    return encodeApprovalQueue(this.list());
  }

  loadJSON(json: string): void {
    const queue = decodeApprovalQueue(json);
    this.clear();
    for (const item of queue.items) this.upsert(item);
  }
}
