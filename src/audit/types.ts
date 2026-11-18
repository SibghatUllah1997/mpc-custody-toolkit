/**
 * One line in the append-only audit log: a policy decision or a pre-sign
 * outcome, with a hash pointer to the previous line.
 */

export const AUDIT_EVENT_TYPE = 'audit-event' as const;
/** Version written by `encodeAuditEvent`. */
export const AUDIT_EVENT_VERSION = 1 as const;
/** `prev` on the first record in a file (64 zero hex chars). */
export const AUDIT_GENESIS_PREV = '0'.repeat(64);
export const AUDIT_ID_BYTES = 8;
/** Compact checksum: first 8 bytes of SHA-256, as 16 hex chars. */
export const AUDIT_CHECKSUM_HEX_LENGTH = 16;

export type AuditKind = 'policy-decision' | 'pre-sign';
export type AuditOutcome = 'allow' | 'deny';

/**
 * Fields a caller supplies. `seq`, `prev`, `id`, and `ts` are filled in
 * when the event is encoded or appended.
 */
export type AuditDraft = {
  kind: AuditKind;
  outcome: AuditOutcome;
  policyId?: string;
  asset?: string;
  value?: string;
  to?: string;
  approvals?: string[];
  /** Denial or failure codes; empty on an allow. */
  codes: string[];
  /** Optional ISO-8601 UTC timestamp; encoded events always have one. */
  ts?: string;
  /** Optional 16-hex id; a random one is issued when omitted. */
  id?: string;
};

export type AuditEvent = {
  version: typeof AUDIT_EVENT_VERSION;
  type: typeof AUDIT_EVENT_TYPE;
  id: string;
  seq: number;
  ts: string;
  kind: AuditKind;
  outcome: AuditOutcome;
  policyId?: string;
  asset?: string;
  value?: string;
  to?: string;
  approvals?: string[];
  codes: string[];
  /** SHA-256 hex of the previous encoded event, or `AUDIT_GENESIS_PREV`. */
  prev: string;
  checksum: { algo: 'sha256'; hex: string };
};

export type EncodeAuditInput = AuditDraft & {
  seq: number;
  prev: string;
};
