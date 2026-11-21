import { randomBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { InputError } from '../errors/input.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { formatUtcTimestamp, parseUtcTimestamp } from '../time/parse.js';
import { transactionDigest } from '../tx/digest.js';
import { freezeTransaction } from '../tx/validate.js';
import type { Transaction } from '../tx/types.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import type { AirgapRequestInput, AirgapSignRequest } from './types.js';

export const AIRGAP_REQUEST_TYPE = 'airgap-sign-request' as const;
export const AIRGAP_REQUEST_VERSION = 2 as const;
export const AIRGAP_CHECKSUM_DOMAIN = 'mpc-custody-toolkit/airgap/v1';

/** Longest free-text note or asset label carried in a request. */
export const MAX_NOTE_CHARS = 256;
export const MAX_ASSET_CHARS = 16;

const ID_REGEX = /^[0-9a-f]{16}$/;
const ASSET_REGEX = /^[A-Za-z0-9._-]+$/;
const REQUEST_KEYS = new Set([
  'type',
  'version',
  'id',
  'kind',
  'digest',
  'publicKey',
  'tx',
  'asset',
  'note',
  'expiresAt',
  'checksum',
]);
const TX_KEYS = new Set(['from', 'to', 'value', 'data']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Transport checksum over the canonical body. Catches copy damage, not tampering. */
export function airgapChecksum(type: string, body: Record<string, unknown>): string {
  const payload = { ...body, domain: AIRGAP_CHECKSUM_DOMAIN, type };
  delete (payload as Record<string, unknown>).checksum;
  return bytesToHex(sha256(new TextEncoder().encode(stableStringify(payload))));
}

function verifyRequestChecksum(doc: Record<string, unknown>): void {
  if (typeof doc.checksum !== 'string' || doc.checksum !== airgapChecksum(AIRGAP_REQUEST_TYPE, doc)) {
    throw new InputError('mismatch', 'request checksum mismatch (file damaged or edited)', 'checksum');
  }
}

/** v1 -> v2: check the old checksum, then re-seal. v1 files have no expiry. */
function migrateRequestV1(doc: Record<string, unknown>): Record<string, unknown> {
  verifyRequestChecksum(doc);
  const next: Record<string, unknown> = {
    version: 2,
    id: doc.id,
    kind: doc.kind,
    digest: doc.digest,
    publicKey: doc.publicKey,
  };
  if (doc.tx !== undefined) next.tx = doc.tx;
  if (doc.asset !== undefined) next.asset = doc.asset;
  if (doc.note !== undefined) next.note = doc.note;
  next.checksum = airgapChecksum(AIRGAP_REQUEST_TYPE, next);
  return next;
}

export const AIRGAP_REQUEST_SCHEMA: SchemaSpec = {
  type: AIRGAP_REQUEST_TYPE,
  label: 'air-gap request',
  minVersion: 1,
  currentVersion: AIRGAP_REQUEST_VERSION,
  migrations: { 1: migrateRequestV1 },
};

export function newRequestId(): string {
  return bytesToHex(randomBytes(8));
}

export function normalizeRequestId(id: unknown, field = 'id'): string {
  if (typeof id !== 'string' || !ID_REGEX.test(id)) {
    throw new InputError('invalid-hex', `${field} must be 16 lowercase hex characters`, field);
  }
  return id;
}

/** Normalize and check a compressed secp256k1 public key. */
export function normalizePublicKey(hex: unknown, field = 'publicKey'): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', `${field} must be a hex string`, field);
  }
  const pub = normalizeHex(hex);
  hexToBytes(pub, 33);
  if (!secp256k1.utils.isValidPublicKey(hexToBytes(pub), true)) {
    throw new InputError('invalid-range', `${field} must be a compressed secp256k1 point`, field);
  }
  return pub;
}

function normalizeDigest(hex: unknown, field = 'digest'): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', `${field} must be a hex string`, field);
  }
  const digest = normalizeHex(hex);
  hexToBytes(digest, 32);
  return digest;
}

function normalizeAsset(asset: unknown): string | undefined {
  if (asset === undefined) return undefined;
  if (typeof asset !== 'string' || asset.length === 0 || asset.length > MAX_ASSET_CHARS || !ASSET_REGEX.test(asset)) {
    throw new InputError('invalid-type', `asset must be 1..${MAX_ASSET_CHARS} letters, digits, '.', '_' or '-'`, 'asset');
  }
  return asset;
}

function normalizeNote(note: unknown): string | undefined {
  if (note === undefined) return undefined;
  // Control characters could hide or rewrite text on the offline screen.
  if (typeof note !== 'string' || note.length > MAX_NOTE_CHARS || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(note)) {
    throw new InputError('invalid-type', `note must be printable text up to ${MAX_NOTE_CHARS} characters`, 'note');
  }
  return note;
}

function normalizeTx(tx: unknown): Transaction {
  if (!isRecord(tx)) throw new InputError('invalid-type', 'tx must be an object', 'tx');
  for (const k of Object.keys(tx)) {
    if (!TX_KEYS.has(k)) throw new InputError('invalid-type', `unexpected tx field: ${k}`, `tx.${k}`);
  }
  return freezeTransaction(tx as Transaction);
}

function freezeRequest(req: AirgapSignRequest): AirgapSignRequest {
  const out: AirgapSignRequest = { id: req.id, kind: req.kind, digest: req.digest, publicKey: req.publicKey };
  if (req.tx) out.tx = req.tx;
  if (req.asset !== undefined) out.asset = req.asset;
  if (req.note !== undefined) out.note = req.note;
  if (req.expiresAt !== undefined) out.expiresAt = req.expiresAt;
  return Object.freeze(out);
}

function normalizeExpiresAt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return formatUtcTimestamp(parseUtcTimestamp(value, 'expiresAt'));
}

/**
 * Build an unsigned request on the online side. Pass either a transaction
 * (its digest is derived) or a raw 32-byte digest, never both.
 */
export function createSignRequest(input: AirgapRequestInput): AirgapSignRequest {
  if (!isRecord(input)) throw new InputError('invalid-type', 'request input must be an object');
  const hasTx = input.tx !== undefined;
  const hasDigest = input.digestHex !== undefined;
  if (hasTx === hasDigest) {
    throw new InputError('missing-value', 'pass exactly one of tx or digestHex', hasTx ? 'digest' : 'tx');
  }
  const publicKey = normalizePublicKey(input.publicKeyHex, 'pubkey');
  const id = input.id === undefined ? newRequestId() : normalizeRequestId(input.id);
  const asset = normalizeAsset(input.asset);
  const note = normalizeNote(input.note);
  const expiresAt = normalizeExpiresAt(input.expiresAt);
  if (hasTx) {
    const tx = normalizeTx(input.tx);
    const digest = bytesToHex(transactionDigest(tx));
    return freezeRequest({ id, kind: 'transaction', digest, publicKey, tx, asset, note, expiresAt });
  }
  if (asset !== undefined) {
    throw new InputError('invalid-type', 'asset only applies to transaction requests', 'asset');
  }
  return freezeRequest({
    id,
    kind: 'digest',
    digest: normalizeDigest(input.digestHex),
    publicKey,
    note,
    expiresAt,
  });
}

function requestBody(req: AirgapSignRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    version: AIRGAP_REQUEST_VERSION,
    id: req.id,
    kind: req.kind,
    digest: req.digest,
    publicKey: req.publicKey,
  };
  if (req.tx) body.tx = { ...req.tx };
  if (req.asset !== undefined) body.asset = req.asset;
  if (req.note !== undefined) body.note = req.note;
  if (req.expiresAt !== undefined) body.expiresAt = req.expiresAt;
  return body;
}

export function encodeSignRequest(req: AirgapSignRequest): string {
  const checked = createSignRequest(
    req.kind === 'transaction'
      ? {
          id: req.id,
          publicKeyHex: req.publicKey,
          tx: req.tx,
          asset: req.asset,
          note: req.note,
          expiresAt: req.expiresAt,
        }
      : {
          id: req.id,
          publicKeyHex: req.publicKey,
          digestHex: req.digest,
          note: req.note,
          expiresAt: req.expiresAt,
        }
  );
  if (checked.digest !== req.digest) {
    throw new InputError('mismatch', 'request digest does not match its transaction', 'digest');
  }
  const body = requestBody(checked);
  const doc = { type: AIRGAP_REQUEST_TYPE, ...body, checksum: airgapChecksum(AIRGAP_REQUEST_TYPE, body) };
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse and fully re-check a request file. Unknown fields are rejected so a
 * file cannot carry content the signing screen never shows.
 */
export function decodeSignRequest(json: string): AirgapSignRequest {
  const { doc } = upgradeDocument(parseDocument(json), AIRGAP_REQUEST_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!REQUEST_KEYS.has(k)) throw new InputError('invalid-type', `unexpected request field: ${k}`, k);
  }
  verifyRequestChecksum(doc);
  const kind = doc.kind;
  if (kind !== 'transaction' && kind !== 'digest') {
    throw new InputError('invalid-type', 'request kind must be transaction or digest', 'kind');
  }
  if (kind === 'transaction' && doc.tx === undefined) {
    throw new InputError('missing-value', 'transaction request is missing tx', 'tx');
  }
  if (kind === 'digest' && doc.tx !== undefined) {
    throw new InputError('invalid-type', 'digest request must not carry tx', 'tx');
  }
  const id = normalizeRequestId(doc.id);
  const digest = normalizeDigest(doc.digest);
  let expiresAt: string | undefined;
  if (doc.expiresAt !== undefined) {
    if (typeof doc.expiresAt !== 'string') {
      throw new InputError('invalid-type', 'expiresAt must be an ISO-8601 UTC timestamp', 'expiresAt');
    }
    expiresAt = doc.expiresAt;
  }
  const built = createSignRequest(
    kind === 'transaction'
      ? {
          id,
          publicKeyHex: doc.publicKey as string,
          tx: doc.tx as Transaction,
          asset: doc.asset as string | undefined,
          note: doc.note as string | undefined,
          expiresAt,
        }
      : {
          id,
          publicKeyHex: doc.publicKey as string,
          digestHex: digest,
          asset: doc.asset as string | undefined,
          note: doc.note as string | undefined,
          expiresAt,
        }
  );
  if (built.digest !== digest) {
    throw new InputError('mismatch', 'request digest does not match its transaction', 'digest');
  }
  return built;
}
