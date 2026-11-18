import type { Policy, PolicyDecision, SignRequest } from '../policy/types.js';
import type { PreSignResult } from '../presign/types.js';
import { appendAuditEvent } from './store.js';
import type { AuditDraft, AuditEvent, AuditKind } from './types.js';

/** Sign request plus optional destination copied onto the audit line. */
export type PolicyAuditRequest = SignRequest & { to?: string };

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function fillCommon(
  draft: AuditDraft,
  input: {
    policyId?: string;
    asset?: string;
    value?: string;
    to?: string;
    approvals?: string[];
  }
): AuditDraft {
  if (input.policyId !== undefined) draft.policyId = input.policyId;
  if (input.asset !== undefined) draft.asset = input.asset;
  if (input.value !== undefined) draft.value = input.value;
  if (input.to !== undefined) draft.to = input.to;
  if (input.approvals !== undefined) draft.approvals = input.approvals.slice();
  return draft;
}

/**
 * Map a policy evaluation onto an audit draft. Does not write a file.
 */
export function draftFromPolicyDecision(input: {
  policy: Pick<Policy, 'id'>;
  request: PolicyAuditRequest;
  decision: PolicyDecision;
}): AuditDraft {
  if (!input || typeof input !== 'object') {
    throw new Error('policy audit input must be an object');
  }
  if (!input.decision || typeof input.decision !== 'object') {
    throw new Error('policy decision is required');
  }
  if (!input.request || typeof input.request !== 'object') {
    throw new Error('sign request is required');
  }
  const allowed = input.decision.allowed === true;
  return fillCommon(
    {
      kind: 'policy-decision',
      outcome: allowed ? 'allow' : 'deny',
      codes: allowed ? [] : uniqueCodes(input.decision.reasons.map((r) => r.code)),
    },
    {
      policyId: input.policy?.id,
      asset: input.request.asset,
      value: input.request.value,
      to: input.request.to,
      approvals: input.request.approvals,
    }
  );
}

function preSignCodes(result: PreSignResult): string[] {
  return uniqueCodes(result.reasons.map((r) => r.code));
}

/**
 * Map a pre-sign result onto an audit draft. Does not write a file.
 */
export function draftFromPreSign(input: {
  policy?: Pick<Policy, 'id'>;
  asset?: string;
  approvals?: string[];
  tx?: { to?: string; value?: string };
  result: PreSignResult;
}): AuditDraft {
  if (!input || typeof input !== 'object') {
    throw new Error('pre-sign audit input must be an object');
  }
  if (!input.result || typeof input.result !== 'object') {
    throw new Error('pre-sign result is required');
  }
  const allowed = input.result.ok === true;
  return fillCommon(
    {
      kind: 'pre-sign' satisfies AuditKind,
      outcome: allowed ? 'allow' : 'deny',
      codes: allowed ? [] : preSignCodes(input.result),
    },
    {
      policyId: input.policy?.id,
      asset: input.asset,
      value: input.tx?.value,
      to: input.tx?.to,
      approvals: input.approvals,
    }
  );
}

export async function recordPolicyDecision(
  path: string,
  input: { policy: Pick<Policy, 'id'>; request: PolicyAuditRequest; decision: PolicyDecision }
): Promise<AuditEvent> {
  return appendAuditEvent(path, draftFromPolicyDecision(input));
}

export async function recordPreSign(
  path: string,
  input: {
    policy?: Pick<Policy, 'id'>;
    asset?: string;
    approvals?: string[];
    tx?: { to?: string; value?: string };
    result: PreSignResult;
  }
): Promise<AuditEvent> {
  return appendAuditEvent(path, draftFromPreSign(input));
}

