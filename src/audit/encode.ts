import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import {
  AUDIT_CHECKSUM_HEX_LENGTH,
  AUDIT_EVENT_TYPE,
  AUDIT_EVENT_VERSION,
  AUDIT_GENESIS_PREV,
  AUDIT_ID_BYTES,
  type AuditDraft,
  type AuditEvent,
  type AuditKind,
  type AuditOutcome,
  type EncodeAuditInput,
} from './types.js';

const KINDS: readonly AuditKind[] = ['policy-decision', 'pre-sign'];
const OUTCOMES: readonly AuditOutcome[] = ['allow', 'deny'];
const ID_RE = /^[0-9a-f]{16}$/;
const PREV_RE = /^[0-9a-f]{64}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_CODES = 16;
const MAX_APPROVALS = 16;
const MAX_CODE_LENGTH = 64;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function newAuditId(): string {
  return bytesToHex(randomBytes(AUDIT_ID_BYTES));
}

export function utcTimestamp(now: Date = new Date()): string {
  const iso = now.toISOString();
  if (!TS_RE.test(iso)) throw new Error('failed to format UTC timestamp');
  return iso;
}

function checksumPayload(event: Omit<AuditEvent, 'checksum'>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    version: event.version,
    type: event.type,
    id: event.id,
    seq: event.seq,
    ts: event.ts,
    kind: event.kind,
    outcome: event.outcome,
    codes: event.codes,
    prev: event.prev,
  };
  if (event.policyId !== undefined) payload.policyId = event.policyId;
  if (event.asset !== undefined) payload.asset = event.asset;
  if (event.value !== undefined) payload.value = event.value;
  if (event.to !== undefined) payload.to = event.to;
  if (event.approvals !== undefined) payload.approvals = event.approvals;
  return payload;
}

export function computeAuditChecksumHex(event: Omit<AuditEvent, 'checksum'>): string {
  const digest = sha256(new TextEncoder().encode(stableStringify(checksumPayload(event))));
  return bytesToHex(digest).slice(0, AUDIT_CHECKSUM_HEX_LENGTH);
}

/** Canonical SHA-256 of a sealed event; stored as `prev` on the next line. */
export function auditRecordHash(event: AuditEvent): string {
  return bytesToHex(sha256(new TextEncoder().encode(stableStringify(event))));
}

function validateDraft(draft: AuditDraft): void {
  assert(draft && typeof draft === 'object', 'audit draft must be an object');
  assert((KINDS as readonly string[]).includes(draft.kind), 'audit kind must be policy-decision or pre-sign');
  assert((OUTCOMES as readonly string[]).includes(draft.outcome), 'audit outcome must be allow or deny');
  assert(Array.isArray(draft.codes), 'audit codes must be an array');
  assert(draft.codes.length <= MAX_CODES, `audit codes must have at most ${MAX_CODES} entries`);
  for (const code of draft.codes) {
    assert(
      typeof code === 'string' && code.length > 0 && code.length <= MAX_CODE_LENGTH,
      `audit code must be 1..${MAX_CODE_LENGTH} characters`
    );
  }
  if (draft.outcome === 'allow') {
    assert(draft.codes.length === 0, 'allowed audit events cannot carry denial codes');
  }
  if (draft.policyId !== undefined) {
    assert(typeof draft.policyId === 'string' && draft.policyId.length > 0, 'policyId must be a non-empty string');
  }
  if (draft.asset !== undefined) {
    assert(typeof draft.asset === 'string' && draft.asset.length > 0, 'asset must be a non-empty string');
  }
  if (draft.value !== undefined) {
    assert(typeof draft.value === 'string', 'value must be a string');
  }
  if (draft.to !== undefined) {
    assert(typeof draft.to === 'string' && draft.to.length > 0, 'to must be a non-empty string');
  }
  if (draft.approvals !== undefined) {
    assert(Array.isArray(draft.approvals), 'approvals must be an array');
    assert(draft.approvals.length <= MAX_APPROVALS, `approvals must have at most ${MAX_APPROVALS} entries`);
    for (const id of draft.approvals) {
      assert(typeof id === 'string' && id.length > 0, 'each approval must be a non-empty string');
    }
  }
  if (draft.id !== undefined) {
    assert(typeof draft.id === 'string' && ID_RE.test(draft.id), 'audit id must be 16 lowercase hex chars');
  }
  if (draft.ts !== undefined) {
    assert(typeof draft.ts === 'string' && TS_RE.test(draft.ts), 'audit ts must be an ISO-8601 UTC timestamp');
  }
}

function sealedEvent(input: EncodeAuditInput): AuditEvent {
  validateDraft(input);
  assert(Number.isInteger(input.seq) && input.seq >= 1, 'audit seq must be an integer >= 1');
  assert(typeof input.prev === 'string' && PREV_RE.test(input.prev), 'audit prev must be 64 lowercase hex chars');
  const unsigned: Omit<AuditEvent, 'checksum'> = {
    version: AUDIT_EVENT_VERSION,
    type: AUDIT_EVENT_TYPE,
    id: input.id ?? newAuditId(),
    seq: input.seq,
    ts: input.ts ?? utcTimestamp(),
    kind: input.kind,
    outcome: input.outcome,
    codes: input.codes.slice(),
    prev: input.prev,
  };
  if (input.policyId !== undefined) unsigned.policyId = input.policyId;
  if (input.asset !== undefined) unsigned.asset = input.asset;
  if (input.value !== undefined) unsigned.value = input.value;
  if (input.to !== undefined) unsigned.to = input.to;
  if (input.approvals !== undefined) unsigned.approvals = input.approvals.slice();
  return { ...unsigned, checksum: { algo: 'sha256', hex: computeAuditChecksumHex(unsigned) } };
}

export const AUDIT_EVENT_SCHEMA: SchemaSpec = {
  type: AUDIT_EVENT_TYPE,
  label: 'audit event',
  minVersion: 1,
  currentVersion: AUDIT_EVENT_VERSION,
  migrations: {},
};

/**
 * Seal a draft as a single JSONL line (compact JSON, no trailing newline).
 */
export function encodeAuditEvent(input: EncodeAuditInput): string {
  return JSON.stringify(sealedEvent(input));
}

function parseCodes(value: unknown): string[] {
  assert(Array.isArray(value), 'codes must be an array');
  return value.map((c) => {
    assert(typeof c === 'string', 'each code must be a string');
    return c;
  });
}

function parseApprovals(value: unknown): string[] {
  assert(Array.isArray(value), 'approvals must be an array');
  return value.map((id) => {
    assert(typeof id === 'string', 'each approval must be a string');
    return id;
  });
}

export function decodeAuditEvent(json: string): AuditEvent {
  const trimmed = json.trim();
  assert(trimmed.length > 0, 'audit record is empty');
  const { doc } = upgradeDocument(parseDocument(trimmed), AUDIT_EVENT_SCHEMA);
  assert(typeof doc.id === 'string', 'id must be a string');
  assert(typeof doc.seq === 'number', 'seq must be a number');
  assert(typeof doc.ts === 'string', 'ts must be a string');
  assert(typeof doc.kind === 'string', 'kind must be a string');
  assert(typeof doc.outcome === 'string', 'outcome must be a string');
  assert(typeof doc.prev === 'string', 'prev must be a string');
  const checksum = doc.checksum;
  assert(isRecord(checksum), 'missing checksum');
  assert(checksum.algo === 'sha256', 'unsupported checksum algo');
  assert(typeof checksum.hex === 'string', 'checksum.hex must be a string');

  const draft: EncodeAuditInput = {
    kind: doc.kind as AuditKind,
    outcome: doc.outcome as AuditOutcome,
    codes: parseCodes(doc.codes),
    seq: doc.seq,
    prev: doc.prev,
    id: doc.id,
    ts: doc.ts,
  };
  if (typeof doc.policyId === 'string') draft.policyId = doc.policyId;
  if (typeof doc.asset === 'string') draft.asset = doc.asset;
  if (typeof doc.value === 'string') draft.value = doc.value;
  if (typeof doc.to === 'string') draft.to = doc.to;
  if (doc.approvals !== undefined) draft.approvals = parseApprovals(doc.approvals);

  const expected = sealedEvent(draft);
  assert(checksum.hex.toLowerCase() === expected.checksum.hex, 'audit checksum mismatch');
  return expected;
}

/**
 * Check that `events` form a contiguous chain: seq 1..n and each `prev`
 * equals the hash of the previous sealed event (or genesis for seq 1).
 */
export function verifyAuditChain(events: AuditEvent[]): void {
  assert(Array.isArray(events), 'audit events must be an array');
  let prev = AUDIT_GENESIS_PREV;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    assert(event && typeof event === 'object', `audit events[${i}] must be an object`);
    assert(event.seq === i + 1, `audit seq gap: expected ${i + 1}, got ${event.seq}`);
    assert(event.prev === prev, `audit chain break at seq ${event.seq}`);
    const roundTrip = decodeAuditEvent(JSON.stringify(event));
    assert(roundTrip.checksum.hex === event.checksum.hex, `audit checksum mismatch at seq ${event.seq}`);
    prev = auditRecordHash(event);
  }
}
