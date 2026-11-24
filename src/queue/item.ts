import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { formatUtcTimestamp, isExpired, parseUtcTimestamp } from '../time/parse.js';
import { transactionDigest } from '../tx/digest.js';
import { freezeTransaction } from '../tx/validate.js';
import type { Transaction } from '../tx/types.js';
import { bytesToHex } from '../utils/bytes.js';
import { isSignerId, MAX_SIGNERS } from '../policy/validate.js';
import {
  assert,
  computeApprovalChecksumHex,
  isRecord,
  newApprovalId,
  normalizeDigestHex,
  normalizePublicKeyHex,
  utcTimestamp,
} from './hash.js';
import { freezeReceipt, verifyReceipt } from './receipt.js';
import {
  APPROVAL_ITEM_TYPE,
  APPROVAL_ITEM_VERSION,
  APPROVAL_TS_RE,
  MAX_DELAY_SECONDS,
  MIN_DELAY_SECONDS,
  type ApprovalItem,
  type ApprovalItemData,
  type ApprovalItemDraft,
  type Approver,
  type ApproverReceipt,
  type QueueStatus,
} from './types.js';

const ID_RE = /^[0-9a-f]{16}$/;

function freezeTx(tx: Transaction): Transaction {
  const frozen = freezeTransaction(tx);
  return { from: frozen.from, to: frozen.to, value: frozen.value, data: frozen.data };
}

function freezeApprover(approver: { id: string; publicKey: string | Uint8Array }, index: number, seen: Set<string>): Approver {
  assert(approver && typeof approver === 'object', `approvers[${index}] must be an object`);
  assert(isSignerId(approver.id), `approvers[${index}].id is not a valid signer id`);
  assert(!seen.has(approver.id), `duplicate approver id: ${approver.id}`);
  seen.add(approver.id);
  return { id: approver.id, publicKey: normalizePublicKeyHex(approver.publicKey) };
}

function freezeApprovers(approvers: ApprovalItemDraft['approvers']): Approver[] {
  assert(Array.isArray(approvers), 'approvers must be an array');
  assert(approvers.length >= 1, 'need at least one approver');
  assert(approvers.length <= MAX_SIGNERS, `approvers must have at most ${MAX_SIGNERS} entries`);
  const seen = new Set<string>();
  return approvers.map((a, i) => freezeApprover(a, i, seen));
}

function freezeReceipts(receipts: ApproverReceipt[] | undefined): ApproverReceipt[] {
  if (receipts === undefined) return [];
  assert(Array.isArray(receipts), 'receipts must be an array');
  const seen = new Set<string>();
  return receipts.map((r) => {
    const frozen = freezeReceipt(r);
    assert(!seen.has(frozen.signerId), `duplicate receipt from ${frozen.signerId}`);
    seen.add(frozen.signerId);
    return frozen;
  });
}

export function buildApprovalItem(draft: ApprovalItemDraft, receipts: ApproverReceipt[] = []): ApprovalItemData {
  assert(draft && typeof draft === 'object', 'approval item draft must be an object');
  const approvers = freezeApprovers(draft.approvers);
  assert(
    Number.isInteger(draft.threshold) && draft.threshold >= 1 && draft.threshold <= approvers.length,
    `threshold must be an integer in 1..${approvers.length}`
  );
  const id = draft.id ?? newApprovalId();
  const createdAt = draft.createdAt ?? utcTimestamp();
  assert(typeof id === 'string' && ID_RE.test(id), 'id must be 16 lowercase hex chars');
  assert(typeof createdAt === 'string' && APPROVAL_TS_RE.test(createdAt), 'createdAt must be an ISO-8601 UTC timestamp');
  const expiresAt = normalizeExpiresAt(draft.expiresAt);
  const delaySeconds = normalizeDelaySeconds(draft.delaySeconds);
  const readyAt = normalizeReadyAt(draft.readyAt);
  if (readyAt !== undefined) {
    assert(delaySeconds !== undefined, 'readyAt requires delaySeconds');
  }

  let digest: string;
  let tx: Transaction | undefined;
  if (draft.tx !== undefined) {
    tx = freezeTx(draft.tx);
    digest = bytesToHex(transactionDigest(tx));
    if (draft.digest !== undefined) {
      assert(normalizeDigestHex(draft.digest) === digest, 'digest does not match the canonical transaction digest');
    }
  } else {
    assert(draft.digest !== undefined, 'approval items need a transaction or a 32-byte digest');
    digest = normalizeDigestHex(draft.digest);
  }

  return {
    id,
    createdAt,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(delaySeconds !== undefined ? { delaySeconds } : {}),
    ...(readyAt !== undefined ? { readyAt } : {}),
    threshold: draft.threshold,
    digest,
    ...(tx !== undefined ? { tx } : {}),
    approvers,
    receipts: freezeReceipts(receipts),
  };
}

function normalizeExpiresAt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return formatUtcTimestamp(parseUtcTimestamp(value, 'expiresAt'));
}

function normalizeReadyAt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return formatUtcTimestamp(parseUtcTimestamp(value, 'readyAt'));
}

function normalizeDelaySeconds(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  assert(
    Number.isInteger(value) &&
      (value as number) >= MIN_DELAY_SECONDS &&
      (value as number) <= MAX_DELAY_SECONDS,
    `delaySeconds must be an integer in ${MIN_DELAY_SECONDS}..${MAX_DELAY_SECONDS}`
  );
  return value as number;
}

function delayUntilOf(item: ApprovalItem): string | undefined {
  if (item.data.delaySeconds === undefined || item.data.readyAt === undefined) return undefined;
  const readyMs = parseUtcTimestamp(item.data.readyAt, 'readyAt').getTime();
  return formatUtcTimestamp(new Date(readyMs + item.data.delaySeconds * 1000));
}

function delayElapsed(item: ApprovalItem, now: Date): boolean {
  if (item.data.delaySeconds === undefined) return true;
  if (item.data.readyAt === undefined) return false;
  const readyMs = parseUtcTimestamp(item.data.readyAt, 'readyAt').getTime();
  return now.getTime() >= readyMs + item.data.delaySeconds * 1000;
}

function validateData(data: ApprovalItemData): ApprovalItemData {
  return buildApprovalItem(
    {
      threshold: data.threshold,
      approvers: data.approvers,
      tx: data.tx,
      digest: data.digest,
      id: data.id,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      delaySeconds: data.delaySeconds,
      readyAt: data.readyAt,
    },
    data.receipts
  );
}

function seal(data: ApprovalItemData): ApprovalItem {
  const frozen = validateData(data);
  const item: ApprovalItem = {
    version: APPROVAL_ITEM_VERSION,
    type: APPROVAL_ITEM_TYPE,
    data: frozen,
    checksum: { algo: 'sha256', hex: computeApprovalChecksumHex(frozen) },
  };
  for (const receipt of frozen.receipts) verifyReceipt(item, receipt);
  return item;
}

export const APPROVAL_ITEM_SCHEMA: SchemaSpec = {
  type: APPROVAL_ITEM_TYPE,
  label: 'approval item',
  minVersion: 1,
  currentVersion: APPROVAL_ITEM_VERSION,
  migrations: {},
};

export function encodeApprovalItem(draft: ApprovalItemDraft): string {
  return JSON.stringify(seal(buildApprovalItem(draft)), null, 2);
}

export function encodeSealedApprovalItem(item: ApprovalItem): string {
  return JSON.stringify(seal(item.data), null, 2);
}

function parseTx(value: unknown): Transaction {
  assert(isRecord(value), 'tx must be an object');
  assert(typeof value.from === 'string', 'tx.from must be a string');
  assert(typeof value.to === 'string', 'tx.to must be a string');
  assert(typeof value.value === 'string', 'tx.value must be a string');
  return freezeTx({
    from: value.from,
    to: value.to,
    value: value.value,
    data: typeof value.data === 'string' ? value.data : '',
  });
}

function parseApprovers(value: unknown): Approver[] {
  assert(Array.isArray(value), 'approvers must be an array');
  return value.map((entry, i) => {
    assert(isRecord(entry), `approvers[${i}] must be an object`);
    assert(typeof entry.id === 'string', `approvers[${i}].id must be a string`);
    assert(typeof entry.publicKey === 'string', `approvers[${i}].publicKey must be a string`);
    return { id: entry.id, publicKey: entry.publicKey };
  });
}

function parseReceipts(value: unknown): ApproverReceipt[] {
  if (value === undefined) return [];
  assert(Array.isArray(value), 'receipts must be an array');
  return value.map((entry, i) => {
    assert(isRecord(entry), `receipts[${i}] must be an object`);
    assert(typeof entry.signerId === 'string', `receipts[${i}].signerId must be a string`);
    assert(typeof entry.publicKey === 'string', `receipts[${i}].publicKey must be a string`);
    assert(typeof entry.signature === 'string', `receipts[${i}].signature must be a string`);
    assert(typeof entry.createdAt === 'string', `receipts[${i}].createdAt must be a string`);
    return {
      signerId: entry.signerId,
      publicKey: entry.publicKey,
      signature: entry.signature,
      createdAt: entry.createdAt,
    };
  });
}

export function decodeApprovalItem(json: string): ApprovalItem {
  const { doc } = upgradeDocument(parseDocument(json), APPROVAL_ITEM_SCHEMA);
  assert(isRecord(doc.data), 'missing data section');
  const checksum = doc.checksum;
  assert(isRecord(checksum), 'missing checksum');
  assert(checksum.algo === 'sha256', 'unsupported checksum algo');
  assert(typeof checksum.hex === 'string', 'checksum.hex must be a string');
  assert(typeof doc.data.id === 'string', 'id must be a string');
  assert(typeof doc.data.createdAt === 'string', 'createdAt must be a string');
  assert(typeof doc.data.threshold === 'number', 'threshold must be a number');
  assert(typeof doc.data.digest === 'string', 'digest must be a string');

  const data: ApprovalItemData = {
    id: doc.data.id,
    createdAt: doc.data.createdAt,
    threshold: doc.data.threshold,
    digest: doc.data.digest,
    approvers: parseApprovers(doc.data.approvers),
    receipts: parseReceipts(doc.data.receipts),
  };
  if (doc.data.tx !== undefined) data.tx = parseTx(doc.data.tx);
  if (doc.data.expiresAt !== undefined) {
    assert(typeof doc.data.expiresAt === 'string', 'expiresAt must be an ISO-8601 UTC timestamp');
    data.expiresAt = doc.data.expiresAt;
  }
  if (doc.data.delaySeconds !== undefined) {
    assert(typeof doc.data.delaySeconds === 'number', 'delaySeconds must be a number');
    data.delaySeconds = doc.data.delaySeconds;
  }
  if (doc.data.readyAt !== undefined) {
    assert(typeof doc.data.readyAt === 'string', 'readyAt must be an ISO-8601 UTC timestamp');
    data.readyAt = doc.data.readyAt;
  }
  const sealed = seal(data);
  assert(checksum.hex.toLowerCase() === sealed.checksum.hex, 'approval item checksum mismatch');
  return sealed;
}

function assertItemFresh(item: ApprovalItem, now: Date, action: string): void {
  if (item.data.expiresAt !== undefined && isExpired(item.data.expiresAt, now)) {
    throw new Error(`cannot ${action}: approval item expiresAt ${item.data.expiresAt} has passed`);
  }
}

/**
 * After the deadline, receipts no longer count. Returns a new sealed item
 * with an empty receipt list, or the input when there is nothing to drop.
 */
export function dropExpiredReceipts(item: ApprovalItem, now: Date = new Date()): ApprovalItem {
  assert(item && typeof item === 'object' && item.data, 'approval item must be an object');
  if (item.data.expiresAt === undefined || !isExpired(item.data.expiresAt, now)) return item;
  if (item.data.receipts.length === 0 && item.data.readyAt === undefined) return item;
  return seal({ ...item.data, receipts: [], readyAt: undefined });
}

/**
 * Append a verified receipt. Duplicate signers, unknown keys, and expired
 * items are refused. Returns a new sealed item; the input is not mutated.
 */
export function addReceipt(item: ApprovalItem, receipt: ApproverReceipt, now: Date = new Date()): ApprovalItem {
  assert(item && typeof item === 'object', 'approval item must be an object');
  assertItemFresh(item, now, 'add a receipt');
  const frozen = freezeReceipt(receipt);
  verifyReceipt(item, frozen);
  assert(
    !item.data.receipts.some((r) => r.signerId === frozen.signerId),
    `duplicate receipt from ${frozen.signerId}`
  );
  const receipts = [...item.data.receipts, frozen];
  let readyAt = item.data.readyAt;
  if (
    item.data.delaySeconds !== undefined &&
    readyAt === undefined &&
    receipts.length >= item.data.threshold
  ) {
    readyAt = utcTimestamp(now);
  }
  return seal({
    ...item.data,
    receipts,
    ...(readyAt !== undefined ? { readyAt } : { readyAt: undefined }),
  });
}

export function inspectApprovalItem(item: ApprovalItem, now: Date = new Date()): QueueStatus {
  assert(item && typeof item === 'object' && item.data, 'approval item must be an object');
  if (item.data.expiresAt !== undefined && isExpired(item.data.expiresAt, now)) {
    return {
      ready: false,
      id: item.data.id,
      threshold: item.data.threshold,
      receiptCount: 0,
      needed: item.data.threshold,
      signerIds: [],
      expired: true,
      delayPending: false,
      reasons: [
        {
          code: 'expired',
          message: `expiresAt ${item.data.expiresAt} has passed`,
        },
      ],
    };
  }
  const reasons: QueueStatus['reasons'] = [];
  const signerIds: string[] = [];
  for (const receipt of item.data.receipts) {
    try {
      verifyReceipt(item, receipt);
      signerIds.push(receipt.signerId);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'invalid receipt';
      reasons.push({ code: 'invalid-receipt', message });
    }
  }
  const receiptCount = signerIds.length;
  const needed = Math.max(0, item.data.threshold - receiptCount);
  if (needed > 0) {
    reasons.push({
      code: 'insufficient-receipts',
      message: `need ${item.data.threshold} receipts, got ${receiptCount}`,
    });
  }
  const delayUntil = delayUntilOf(item);
  let delayPending = false;
  if (needed === 0 && item.data.delaySeconds !== undefined) {
    if (!delayElapsed(item, now)) {
      delayPending = true;
      const until = delayUntil ?? 'the delay deadline';
      reasons.push({
        code: 'delay-pending',
        message:
          item.data.readyAt === undefined
            ? `item needs ${item.data.delaySeconds}s after the last required receipt, but readyAt is missing`
            : `waiting until ${until} (${item.data.delaySeconds}s after readyAt ${item.data.readyAt})`,
      });
    }
  }
  return {
    ready: reasons.length === 0 && needed === 0,
    id: item.data.id,
    threshold: item.data.threshold,
    receiptCount,
    needed,
    signerIds,
    expired: false,
    delayPending,
    ...(item.data.readyAt !== undefined ? { readyAt: item.data.readyAt } : {}),
    ...(delayUntil !== undefined ? { delayUntil } : {}),
    reasons,
  };
}

export function isReady(item: ApprovalItem, now: Date = new Date()): boolean {
  return inspectApprovalItem(item, now).ready;
}

export function approvedSignerIds(item: ApprovalItem, now: Date = new Date()): string[] {
  const status = inspectApprovalItem(item, now);
  assert(status.ready, status.reasons[0]?.message ?? 'approval item is not ready');
  return status.signerIds.slice();
}
