import { describe, expect, it } from 'vitest';
import {
  MemoryApprovalQueue,
  addReceipt,
  decodeApprovalQueue,
  encodeApprovalItem,
  encodeApprovalQueue,
  issueReceipt,
  type ApprovalItem,
} from '../src/queue';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { SchemaError } from '../src/schema';

function sampleItem(): { item: ApprovalItem; alice: ReturnType<typeof generateKeyPair> } {
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const item = JSON.parse(
    encodeApprovalItem({
      threshold: 2,
      approvers: [
        { id: 'alice', publicKey: alice.publicKey },
        { id: 'bob', publicKey: bob.publicKey },
      ],
      digest: '11'.repeat(32),
      id: 'aaaaaaaaaaaaaaaa',
      createdAt: '2026-11-20T00:00:00.000Z',
    })
  ) as ApprovalItem;
  return { item, alice };
}

describe('encodeApprovalQueue / MemoryApprovalQueue', () => {
  it('round-trips items through JSON and keeps insertion order independent of id sort', () => {
    const { item, alice } = sampleItem();
    const withReceipt = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey));
    const json = encodeApprovalQueue([withReceipt]);
    const decoded = decodeApprovalQueue(json);
    expect(decoded.items).toHaveLength(1);
    expect(decoded.items[0].data.receipts[0].signerId).toBe('alice');
    expect(decoded.checksum.hex).toHaveLength(16);
  });

  it('stores, lists, and reloads items in memory', () => {
    const { item, alice } = sampleItem();
    const store = new MemoryApprovalQueue();
    expect(store.upsert(item)).toBe(false);
    expect(store.upsert(addReceipt(item, issueReceipt(item, 'alice', alice.privateKey)))).toBe(true);
    expect(store.size).toBe(1);
    expect(store.has('aaaaaaaaaaaaaaaa')).toBe(true);
    expect(store.get('aaaaaaaaaaaaaaaa')?.data.receipts).toHaveLength(1);

    const json = store.toJSON();
    const other = new MemoryApprovalQueue();
    other.loadJSON(json);
    expect(other.list().map((i) => i.data.id)).toEqual(['aaaaaaaaaaaaaaaa']);
    expect(store.delete('aaaaaaaaaaaaaaaa')).toBe(true);
    expect(store.size).toBe(0);
  });

  it('rejects a duplicate item id and a hand-edited checksum', () => {
    const { item } = sampleItem();
    expect(() => encodeApprovalQueue([item, item])).toThrow(/duplicate approval item id/);
    const parsed = JSON.parse(encodeApprovalQueue([item]));
    parsed.checksum.hex = 'ffffffffffffffff';
    expect(() => decodeApprovalQueue(JSON.stringify(parsed))).toThrow(/checksum mismatch/);
  });

  it('rejects a newer queue schema version', () => {
    try {
      decodeApprovalQueue(JSON.stringify({ version: 9, type: 'approval-queue', items: [] }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaError);
      expect((err as SchemaError).code).toBe('newer-version');
    }
  });
});
