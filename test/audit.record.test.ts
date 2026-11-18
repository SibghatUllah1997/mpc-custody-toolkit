import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  draftFromPolicyDecision,
  draftFromPreSign,
  recordPolicyDecision,
  recordPreSign,
} from '../src/audit';
import { evaluatePolicy, type Policy, type SignRequest } from '../src/policy';
import { runPreSign } from '../src/presign';
import type { Transaction } from '../src/tx';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100' }],
};

function req(overrides: Partial<SignRequest> = {}): SignRequest {
  return { asset: 'ETH', value: '50', approvals: ['alice', 'bob'], ...overrides };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return { from: 'aa', to: 'bb', value: '50', data: '', ...overrides };
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-audit-rec-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('draftFromPolicyDecision', () => {
  it('records an allow with no codes', () => {
    const decision = evaluatePolicy(policy, req());
    const draft = draftFromPolicyDecision({ policy, request: req(), decision });
    expect(draft).toMatchObject({
      kind: 'policy-decision',
      outcome: 'allow',
      codes: [],
      policyId: 'vault-main',
      asset: 'ETH',
      value: '50',
      approvals: ['alice', 'bob'],
    });
  });

  it('copies denial codes and an optional destination', () => {
    const request = { ...req({ value: '101' }), to: 'ccdd' };
    const decision = evaluatePolicy(policy, request);
    const draft = draftFromPolicyDecision({ policy, request, decision });
    expect(draft.outcome).toBe('deny');
    expect(draft.codes).toEqual(['limit-exceeded']);
    expect(draft.to).toBe('ccdd');
  });

  it('rejects a missing decision object', () => {
    expect(() =>
      draftFromPolicyDecision({ policy, request: req(), decision: undefined as never })
    ).toThrow(/policy decision is required/);
  });
});

describe('draftFromPreSign', () => {
  it('records a passing pre-sign from the transfer fields', () => {
    const result = runPreSign({ tx: tx(), policy, asset: 'ETH', approvals: ['alice', 'bob'] });
    const draft = draftFromPreSign({
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      tx: result.tx,
      result,
    });
    expect(draft).toMatchObject({
      kind: 'pre-sign',
      outcome: 'allow',
      codes: [],
      policyId: 'vault-main',
      to: 'bb',
      value: '50',
    });
  });

  it('flattens pre-sign reason codes on a deny', () => {
    const result = runPreSign({
      tx: tx({ value: '101' }),
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
    });
    const draft = draftFromPreSign({
      policy,
      asset: 'ETH',
      approvals: ['alice', 'bob'],
      tx: result.tx,
      result,
    });
    expect(draft.outcome).toBe('deny');
    expect(draft.codes).toEqual(['limit-exceeded']);
  });
});

describe('recordPolicyDecision / recordPreSign', () => {
  it('appends both kinds onto one hash-chained file', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'decisions.jsonl');
      const allowed = evaluatePolicy(policy, req());
      const policyEvent = await recordPolicyDecision(path, { policy, request: req(), decision: allowed });
      const pre = runPreSign({ tx: tx({ value: '101' }), policy, asset: 'ETH', approvals: ['alice', 'bob'] });
      const preEvent = await recordPreSign(path, {
        policy,
        asset: 'ETH',
        approvals: ['alice', 'bob'],
        tx: pre.tx,
        result: pre,
      });
      expect(policyEvent.seq).toBe(1);
      expect(preEvent.seq).toBe(2);
      expect(preEvent.kind).toBe('pre-sign');
      expect(preEvent.outcome).toBe('deny');
      expect(preEvent.codes).toContain('limit-exceeded');
    });
  });
});
