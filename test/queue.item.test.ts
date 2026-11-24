import { describe, expect, it } from 'vitest';
import {
  addReceipt,
  approvedSignerIds,
  buildApprovalItem,
  decodeApprovalItem,
  dropExpiredReceipts,
  encodeApprovalItem,
  encodeSealedApprovalItem,
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

  it('stores expiresAt as a millisecond UTC timestamp and round-trips it', () => {
    const { alice, bob } = keys();
    const json = encodeApprovalItem({
      ...draft(alice, bob),
      expiresAt: '2026-11-22T08:00:00Z',
    });
    const item = JSON.parse(json) as ApprovalItem;
    expect(item.data.expiresAt).toBe('2026-11-22T08:00:00.000Z');
    const decoded = decodeApprovalItem(json);
    expect(decoded.data.expiresAt).toBe('2026-11-22T08:00:00.000Z');
    expect(decoded.data.createdAt).toBe('2026-11-20T00:00:00.000Z');
  });

  it('loads an item that never had an expiry', () => {
    const { alice, bob } = keys();
    const item = decodeApprovalItem(encodeApprovalItem(draft(alice, bob)));
    expect(item.data.expiresAt).toBeUndefined();
  });

  it('rejects a non-UTC expiresAt', () => {
    const { alice, bob } = keys();
    expect(() =>
      encodeApprovalItem({ ...draft(alice, bob), expiresAt: '2026-11-22T08:00:00+05:00' })
    ).toThrow(/UTC timestamp/);
  });

  it('stops counting receipts once expiresAt has passed', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), expiresAt: '2026-11-22T08:00:00.000Z' })
    ) as ApprovalItem;
    const before = new Date('2026-11-22T07:59:59.000Z');
    const after = new Date('2026-11-22T08:00:00.000Z');
    const withAlice = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey, before), before);
    expect(inspectApprovalItem(withAlice, before)).toMatchObject({
      ready: false,
      receiptCount: 1,
      expired: false,
    });
    expect(inspectApprovalItem(withAlice, after)).toMatchObject({
      ready: false,
      receiptCount: 0,
      needed: 2,
      signerIds: [],
      expired: true,
    });
    expect(inspectApprovalItem(withAlice, after).reasons[0]).toMatchObject({ code: 'expired' });
  });

  it('refuses a new receipt after the deadline', () => {
    const { alice, bob } = keys();
    const item = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), expiresAt: '2026-11-22T08:00:00.000Z' })
    ) as ApprovalItem;
    const after = new Date('2026-11-22T08:00:00.000Z');
    expect(() => issueReceipt(item, 'alice', alice.privateKey, after)).toThrow(/expiresAt .* has passed/);
    const stale = issueReceipt(item, 'alice', alice.privateKey, new Date('2026-11-22T07:00:00.000Z'));
    expect(() => addReceipt(item, stale, after)).toThrow(/expiresAt .* has passed/);
  });

  it('is not ready until delaySeconds after the last required receipt', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), delaySeconds: 600 })
    ) as ApprovalItem;
    expect(empty.data.delaySeconds).toBe(600);
    expect(empty.data.readyAt).toBeUndefined();

    const t0 = new Date('2026-11-24T08:00:00.000Z');
    const withAlice = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey, t0), t0);
    expect(withAlice.data.readyAt).toBeUndefined();
    expect(inspectApprovalItem(withAlice, t0).delayPending).toBe(false);

    const tReady = new Date('2026-11-24T08:05:00.000Z');
    const withBoth = addReceipt(withAlice, issueReceipt(withAlice, 'bob', bob.privateKey, tReady), tReady);
    expect(withBoth.data.readyAt).toBe('2026-11-24T08:05:00.000Z');
    expect(inspectApprovalItem(withBoth, tReady)).toMatchObject({
      ready: false,
      needed: 0,
      receiptCount: 2,
      delayPending: true,
      readyAt: '2026-11-24T08:05:00.000Z',
      delayUntil: '2026-11-24T08:15:00.000Z',
    });
    expect(inspectApprovalItem(withBoth, tReady).reasons[0]).toMatchObject({ code: 'delay-pending' });
    expect(isReady(withBoth, tReady)).toBe(false);
    expect(() => approvedSignerIds(withBoth, tReady)).toThrow(/waiting until/);

    const justBefore = new Date('2026-11-24T08:14:59.000Z');
    expect(isReady(withBoth, justBefore)).toBe(false);
    const atDeadline = new Date('2026-11-24T08:15:00.000Z');
    expect(isReady(withBoth, atDeadline)).toBe(true);
    expect(inspectApprovalItem(withBoth, atDeadline)).toMatchObject({
      ready: true,
      delayPending: false,
      needed: 0,
    });
    expect(approvedSignerIds(withBoth, atDeadline)).toEqual(['alice', 'bob']);
  });

  it('round-trips delaySeconds and readyAt through JSON', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), delaySeconds: 60 })
    ) as ApprovalItem;
    const now = new Date('2026-11-24T09:00:00.000Z');
    const withAlice = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey, now), now);
    const ready = addReceipt(withAlice, issueReceipt(withAlice, 'bob', bob.privateKey, now), now);
    const decoded = decodeApprovalItem(JSON.stringify(ready, null, 2));
    expect(decoded.data.delaySeconds).toBe(60);
    expect(decoded.data.readyAt).toBe('2026-11-24T09:00:00.000Z');
    expect(isReady(decoded, new Date('2026-11-24T09:01:00.000Z'))).toBe(true);
  });

  it('rejects a delaySeconds out of range and readyAt without a delay', () => {
    const { alice, bob } = keys();
    expect(() => encodeApprovalItem({ ...draft(alice, bob), delaySeconds: 0 })).toThrow(/delaySeconds must be an integer/);
    expect(() => encodeApprovalItem({ ...draft(alice, bob), delaySeconds: 1.5 })).toThrow(/delaySeconds must be an integer/);
    expect(() =>
      encodeApprovalItem({ ...draft(alice, bob), readyAt: '2026-11-24T09:00:00.000Z' })
    ).toThrow(/readyAt requires delaySeconds/);
  });

  it('fails closed when delaySeconds is set but readyAt was never recorded', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), delaySeconds: 120 })
    ) as ApprovalItem;
    const now = new Date('2026-11-24T09:00:00.000Z');
    const receipts = [
      issueReceipt(empty, 'alice', alice.privateKey, now),
      issueReceipt(empty, 'bob', bob.privateKey, now),
    ];
    const data = buildApprovalItem({ ...draft(alice, bob), delaySeconds: 120 }, receipts);
    expect(data.readyAt).toBeUndefined();
    const item = decodeApprovalItem(encodeSealedApprovalItem({ ...empty, data }));
    const status = inspectApprovalItem(item, new Date('2026-11-24T10:00:00.000Z'));
    expect(status.ready).toBe(false);
    expect(status.delayPending).toBe(true);
    expect(status.receiptCount).toBe(2);
    expect(status.reasons[0]).toMatchObject({ code: 'delay-pending' });
    expect(status.reasons[0].message).toMatch(/readyAt is missing/);
  });

  it('clears readyAt together with receipts after the deadline', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({
        ...draft(alice, bob),
        delaySeconds: 60,
        expiresAt: '2026-11-24T10:00:00.000Z',
      })
    ) as ApprovalItem;
    const before = new Date('2026-11-24T09:00:00.000Z');
    const withAlice = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey, before), before);
    const withBoth = addReceipt(withAlice, issueReceipt(withAlice, 'bob', bob.privateKey, before), before);
    expect(withBoth.data.readyAt).toBe('2026-11-24T09:00:00.000Z');
    const dropped = dropExpiredReceipts(withBoth, new Date('2026-11-24T10:00:00.000Z'));
    expect(dropped.data.receipts).toEqual([]);
    expect(dropped.data.readyAt).toBeUndefined();
    expect(dropped.data.delaySeconds).toBe(60);
  });

  it('drops stored receipts after the deadline and leaves a live item unchanged', () => {
    const { alice, bob } = keys();
    const empty = JSON.parse(
      encodeApprovalItem({ ...draft(alice, bob), expiresAt: '2026-11-22T08:00:00.000Z' })
    ) as ApprovalItem;
    const before = new Date('2026-11-22T07:00:00.000Z');
    const withAlice = addReceipt(empty, issueReceipt(empty, 'alice', alice.privateKey, before), before);
    expect(dropExpiredReceipts(withAlice, before).data.receipts).toHaveLength(1);
    const dropped = dropExpiredReceipts(withAlice, new Date('2026-11-22T08:00:00.000Z'));
    expect(dropped.data.receipts).toEqual([]);
    expect(dropped.data.readyAt).toBeUndefined();
    expect(dropped.checksum.hex).not.toBe(withAlice.checksum.hex);
    const open = JSON.parse(encodeApprovalItem(draft(alice, bob))) as ApprovalItem;
    const openWith = addReceipt(open, issueReceipt(open, 'alice', alice.privateKey));
    expect(dropExpiredReceipts(openWith).data.receipts).toHaveLength(1);
  });
});
