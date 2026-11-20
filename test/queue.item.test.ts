import { describe, expect, it } from 'vitest';
import {
  addReceipt,
  approvedSignerIds,
  decodeApprovalItem,
  encodeApprovalItem,
  inspectApprovalItem,
  isReady,
  issueReceipt,
  type ApprovalItem,
} from '../src/queue';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { SchemaError } from '../src/schema';
import { transactionDigest } from '../src/tx';
import { bytesToHex } from '../src/utils/bytes';

const TX = { from: 'aa11', to: 'bb22', value: '40', data: '' };

function keys() {
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const carol = generateKeyPair();
  return { alice, bob, carol };
}

function draft(alice: ReturnType<typeof generateKeyPair>, bob: ReturnType<typeof generateKeyPair>) {
  return {
    threshold: 2,
    approvers: [
      { id: 'alice', publicKey: alice.publicKey },
      { id: 'bob', publicKey: bob.publicKey },
      { id: 'carol', publicKey: generateKeyPair().publicKey },
    ],
    tx: TX,
    id: 'aaaaaaaaaaaaaaaa',
    createdAt: '2026-11-20T00:00:00.000Z',
  };
}

describe('encodeApprovalItem / receipts', () => {
  it('is not ready until k distinct receipts verify', () => {
    const { alice, bob } = keys();
    const item = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    expect(item.data.digest).toBe(bytesToHex(transactionDigest(TX)));
    expect(isReady(item)).toBe(false);
    expect(inspectApprovalItem(item)).toMatchObject({
      ready: false,
      needed: 2,
      receiptCount: 0,
    });

    const withAlice = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey, new Date('2026-11-20T01:00:00Z')));
    expect(isReady(withAlice)).toBe(false);
    expect(inspectApprovalItem(withAlice).signerIds).toEqual(['alice']);

    const ready = addReceipt(withAlice, issueReceipt(withAlice, 'bob', bob.privateKey, new Date('2026-11-20T01:01:00Z')));
    expect(isReady(ready)).toBe(true);
    expect(approvedSignerIds(ready)).toEqual(['alice', 'bob']);
    expect(inspectApprovalItem(ready).needed).toBe(0);
  });

  it('round-trips a sealed item with receipts through JSON', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    const withOne = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey));
    const decoded = decodeApprovalItem(JSON.stringify(withOne, null, 2));
    expect(decoded.data.receipts).toHaveLength(1);
    expect(decoded.data.receipts[0].signerId).toBe('alice');
    expect(isReady(decoded)).toBe(false);
  });

  it('rejects a second receipt from the same signer and an unknown signer', () => {
    const { alice, bob } = keys();
    const item = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    const first = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey));
    expect(() => addReceipt(first, issueReceipt(first, 'alice', alice.privateKey))).toThrow(/duplicate receipt from alice/);
    expect(() => issueReceipt(item, 'dave', alice.privateKey)).toThrow(/unknown approver: dave/);
  });

  it('rejects a receipt signed with the wrong key', () => {
    const { alice, bob } = keys();
    const item = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    expect(() => issueReceipt(item, 'alice', bob.privateKey)).toThrow(/does not match approver alice/);
  });

  it('rejects a receipt replayed onto a different item', () => {
    const { alice, bob } = keys();
    const a = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    const b = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), id: 'bbbbbbbbbbbbbbbb', digest: '11'.repeat(32), tx: undefined })
    ) as ApprovalItem;
    const receipt = issueReceipt(a, 'alice', alice.privateKey);
    expect(() => addReceipt(b, receipt)).toThrow(/does not verify/);
  });

  it('rejects a checksum that was edited by hand', () => {
    const { alice, bob } = keys();
    const parsed = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    parsed.checksum.hex = 'ffffffffffffffff';
    expect(() => decodeApprovalItem(JSON.stringify(parsed))).toThrow(/checksum mismatch/);
  });

  it('rejects a newer schema version', () => {
    try {
      decodeApprovalItem(JSON.stringify({ version: 9, type: 'approval-item', data: {} }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaError);
      expect((err as SchemaError).code).toBe('newer-version');
    }
  });

  it('refuses approvedSignerIds until the item is ready', () => {
    const { alice, bob } = keys();
    const item = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    expect(() => approvedSignerIds(item)).toThrow(/need 2 receipts, got 0/);
  });
});
