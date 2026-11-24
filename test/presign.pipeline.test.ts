import { describe, expect, it } from 'vitest';
import { runPreSign } from '../src/presign';
import type { Policy } from '../src/policy';
import { addReceipt, encodeApprovalItem, issueReceipt, type ApprovalItem } from '../src/queue';
import { generateKeyPair } from '../src/crypto/secp256k1';
import type { Transaction } from '../src/tx';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [
    { asset: 'ETH', maxValue: '100' },
    { asset: '*', maxValue: '10' },
  ],
};

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    from: 'aa',
    to: 'bb',
    value: '50',
    data: '',
    ...overrides,
  };
}

describe('runPreSign', () => {
  it('allows a valid transfer that meets the policy threshold and cap', () => {
    const result = runPreSign({
      tx: tx({ from: '0xAA' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(true);
    expect(result.tx?.from).toBe('aa');
    expect(result.policy?.allowed).toBe(true);
    expect(result.policy?.approvalCount).toBe(2);
    expect(result.reasons).toEqual([]);
  });

  it('stops on a malformed transaction without evaluating policy', () => {
    const result = runPreSign({
      tx: tx({ value: '01' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.tx).toBeUndefined();
    expect(result.policy).toBeUndefined();
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatchObject({ stage: 'transaction', code: 'invalid-transaction' });
  });

  it('denies when approvals fall short of the threshold', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice'],
    });
    expect(result.ok).toBe(false);
    expect(result.tx?.value).toBe('50');
    expect(result.reasons[0]).toMatchObject({
      stage: 'policy',
      code: 'insufficient-approvals',
    });
  });

  it('denies when the transfer value exceeds the matched spend cap', () => {
    const result = runPreSign({
      tx: tx({ value: '101' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons[0].code).toBe('limit-exceeded');
    expect(result.policy?.matchedLimit?.asset).toBe('ETH');
  });

  it('uses the frozen transaction value, not a separate request amount', () => {
    const result = runPreSign({
      tx: tx({ value: '10' }),
      policy,
      asset: 'BTC',
      approvals: ['alice', 'carol'],
    });
    expect(result.ok).toBe(true);
    expect(result.policy?.matchedLimit?.asset).toBe('*');
  });

  it('returns an invalid-policy reason instead of throwing on a broken policy', () => {
    const broken = { ...policy, threshold: 0 };
    const result = runPreSign({
      tx: tx(),
      policy: broken,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatchObject({ stage: 'policy', code: 'invalid-policy' });
  });

  it('rejects a missing input object', () => {
    const result = runPreSign(undefined as never);
    expect(result.ok).toBe(false);
    expect(result.reasons[0].code).toBe('invalid-input');
  });

  it('attaches a simulation when gasPrice is provided', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      gasPrice: '2',
    });
    expect(result.ok).toBe(true);
    expect(result.simulation?.gasUnits).toBe('21000');
    expect(result.simulation?.fee).toBe('42000');
    expect(result.simulation?.total).toBe('42050');
    expect(result.simulation?.limit?.withinLimit).toBe(true);
  });

  it('denies when value plus fee exceeds the matched cap', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      gasPrice: '1',
      includeFeeInLimit: true,
    });
    expect(result.ok).toBe(false);
    expect(result.policy?.allowed).toBe(true);
    expect(result.reasons).toEqual([
      expect.objectContaining({ stage: 'simulation', code: 'fee-limit-exceeded' }),
    ]);
    expect(result.simulation?.limit?.withinLimit).toBe(false);
  });

  it('collects policy and simulation failures in one result', () => {
    const result = runPreSign({
      tx: tx({ value: '101' }),
      policy,
      asset: 'ETH',
      approvals: ['alice'],
      gasPrice: '1',
      includeFeeInLimit: true,
    });
    expect(result.ok).toBe(false);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('insufficient-approvals');
    expect(codes).toContain('fee-limit-exceeded');
  });

  it('denies a transfer whose destination is not on the allow list', () => {
    const gated: Policy = {
      ...policy,
      limits: [{ asset: 'ETH', maxValue: '100', allowTo: ['bb'], denyTo: ['cc'] }],
    };
    const blocked = runPreSign({
      tx: tx({ to: 'dd' }),
      policy: gated,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons[0]).toMatchObject({ stage: 'policy', code: 'destination-not-allowed' });

    const denied = runPreSign({
      tx: tx({ to: 'cc' }),
      policy: gated,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(denied.reasons[0].code).toBe('destination-denied');

    const allowed = runPreSign({
      tx: tx({ to: 'bb' }),
      policy: gated,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    expect(allowed.ok).toBe(true);
  });

  it('returns invalid-simulation when gasPrice is malformed', () => {
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      gasPrice: '01',
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual([
      expect.objectContaining({ stage: 'simulation', code: 'invalid-simulation' }),
    ]);
  });

  it('stops before policy when a queue item does not yet have k receipts', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const item = JSON.parse(
      encodeApprovalItem({
        threshold: 2,
        approvers: [
          { id: 'alice', publicKey: alice.publicKey },
          { id: 'bob', publicKey: bob.publicKey },
        ],
        tx: tx(),
        id: 'aaaaaaaaaaaaaaaa',
        createdAt: '2026-11-20T00:00:00.000Z',
      })
    ) as ApprovalItem;
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      queueItem: item,
    });
    expect(result.ok).toBe(false);
    expect(result.policy).toBeUndefined();
    expect(result.queue?.ready).toBe(false);
    expect(result.reasons[0]).toMatchObject({ stage: 'approval', code: 'insufficient-receipts' });
  });

  it('uses verified receipt signer ids once the queue item is ready', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    let item = JSON.parse(
      encodeApprovalItem({
        threshold: 2,
        approvers: [
          { id: 'alice', publicKey: alice.publicKey },
          { id: 'bob', publicKey: bob.publicKey },
        ],
        tx: tx(),
        id: 'bbbbbbbbbbbbbbbb',
        createdAt: '2026-11-20T00:00:00.000Z',
      })
    ) as ApprovalItem;
    item = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey));
    item = addReceipt(item, issueReceipt(item, 'bob', bob.privateKey));
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: [],
      queueItem: item,
    });
    expect(result.ok).toBe(true);
    expect(result.queue?.ready).toBe(true);
    expect(result.queue?.signerIds).toEqual(['alice', 'bob']);
    expect(result.policy?.approvalCount).toBe(2);
  });

  it('stops before policy when a queue item has expired', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    let item = JSON.parse(
      encodeApprovalItem({
        threshold: 2,
        approvers: [
          { id: 'alice', publicKey: alice.publicKey },
          { id: 'bob', publicKey: bob.publicKey },
        ],
        tx: tx(),
        id: 'dddddddddddddddd',
        createdAt: '2026-11-20T00:00:00.000Z',
        expiresAt: '2026-11-21T10:00:00.000Z',
      })
    ) as ApprovalItem;
    const before = new Date('2026-11-21T09:00:00.000Z');
    item = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey, before), before);
    item = addReceipt(item, issueReceipt(item, 'bob', bob.privateKey, before), before);
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      queueItem: item,
    });
    expect(result.ok).toBe(false);
    expect(result.policy).toBeUndefined();
    expect(result.queue?.expired).toBe(true);
    expect(result.queue?.receiptCount).toBe(0);
    expect(result.reasons[0]).toMatchObject({ stage: 'approval', code: 'expired' });
  });

  it('stops before policy while the queue delay is still running', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    let item = JSON.parse(
      encodeApprovalItem({
        threshold: 2,
        approvers: [
          { id: 'alice', publicKey: alice.publicKey },
          { id: 'bob', publicKey: bob.publicKey },
        ],
        tx: tx(),
        id: 'eeeeeeeeeeeeeeee',
        createdAt: '2026-11-20T00:00:00.000Z',
        delaySeconds: 600,
      })
    ) as ApprovalItem;
    const tReady = new Date('2026-11-24T08:05:00.000Z');
    item = addReceipt(item, issueReceipt(item, 'alice', alice.privateKey, tReady), tReady);
    item = addReceipt(item, issueReceipt(item, 'bob', bob.privateKey, tReady), tReady);
    const waiting = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: [],
      queueItem: item,
      now: tReady,
    });
    expect(waiting.ok).toBe(false);
    expect(waiting.policy).toBeUndefined();
    expect(waiting.queue).toMatchObject({ ready: false, delayPending: true, needed: 0 });
    expect(waiting.reasons[0]).toMatchObject({ stage: 'approval', code: 'delay-pending' });

    const done = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: [],
      queueItem: item,
      now: new Date('2026-11-24T08:15:00.000Z'),
    });
    expect(done.ok).toBe(true);
    expect(done.queue?.ready).toBe(true);
    expect(done.policy?.approvalCount).toBe(2);
  });

  it('rejects a queue item bound to a different transaction digest', () => {
    const alice = generateKeyPair();
    const item = JSON.parse(
      encodeApprovalItem({
        threshold: 1,
        approvers: [{ id: 'alice', publicKey: alice.publicKey }],
        digest: '11'.repeat(32),
        id: 'cccccccccccccccc',
        createdAt: '2026-11-20T00:00:00.000Z',
      })
    ) as ApprovalItem;
    const result = runPreSign({
      tx: tx(),
      policy,
      asset: 'ETH',
      approvals: ['alice'],
      queueItem: item,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatchObject({ stage: 'approval', code: 'digest-mismatch' });
  });
});

