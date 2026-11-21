/**
 * Append-only JSONL log of air-gap request ids this machine has already
 * signed. A leftover USB copy of the same request cannot be signed twice.
 */

import { appendFile, readFile, stat } from 'node:fs/promises';
import { sha256 } from '@noble/hashes/sha256';
import { DEFAULT_MAX_NDJSON_LINE_BYTES } from '../encoding/ndjson.js';
import { InputError } from '../errors/input.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { formatUtcTimestamp, parseUtcTimestamp } from '../time/parse.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import { normalizePublicKey, normalizeRequestId } from './request.js';

export const SPENT_REQUEST_TYPE = 'airgap-spent-request' as const;
export const SPENT_REQUEST_VERSION = 1 as const;
export const SPENT_CHECKSUM_HEX_LENGTH = 16;
export const MAX_SPENT_LINE_BYTES = DEFAULT_MAX_NDJSON_LINE_BYTES;

export type SpentRequestDraft = {
  id: string;
  digest: string;
  publicKey: string;
  signedAt?: string;
};

export type SpentRequestRecord = {
  version: typeof SPENT_REQUEST_VERSION;
  type: typeof SPENT_REQUEST_TYPE;
  id: string;
  digest: string;
  publicKey: string;
  signedAt: string;
  checksum: { algo: 'sha256'; hex: string };
};

const RECORD_KEYS = new Set(['type', 'version', 'id', 'digest', 'publicKey', 'signedAt', 'checksum']);

export const SPENT_REQUEST_SCHEMA: SchemaSpec = {
  type: SPENT_REQUEST_TYPE,
  label: 'spent-request record',
  minVersion: 1,
  currentVersion: SPENT_REQUEST_VERSION,
  migrations: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDigest(hex: unknown): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', 'digest must be a hex string', 'digest');
  }
  const digest = normalizeHex(hex);
  hexToBytes(digest, 32);
  return digest;
}

function checksumPayload(record: Omit<SpentRequestRecord, 'checksum'>): Record<string, unknown> {
  return {
    version: record.version,
    type: record.type,
    id: record.id,
    digest: record.digest,
    publicKey: record.publicKey,
    signedAt: record.signedAt,
  };
}

export function computeSpentChecksumHex(record: Omit<SpentRequestRecord, 'checksum'>): string {
  const digest = sha256(new TextEncoder().encode(stableStringify(checksumPayload(record))));
  return bytesToHex(digest).slice(0, SPENT_CHECKSUM_HEX_LENGTH);
}

function seal(draft: SpentRequestDraft): SpentRequestRecord {
  if (!draft || typeof draft !== 'object') {
    throw new InputError('invalid-type', 'spent-request draft must be an object');
  }
  const unsigned: Omit<SpentRequestRecord, 'checksum'> = {
    version: SPENT_REQUEST_VERSION,
    type: SPENT_REQUEST_TYPE,
    id: normalizeRequestId(draft.id),
    digest: normalizeDigest(draft.digest),
    publicKey: normalizePublicKey(draft.publicKey),
    signedAt: formatUtcTimestamp(parseUtcTimestamp(draft.signedAt ?? formatUtcTimestamp(), 'signedAt')),
  };
  return {
    ...unsigned,
    checksum: { algo: 'sha256', hex: computeSpentChecksumHex(unsigned) },
  };
}

/** Compact JSONL line, no trailing newline. */
export function encodeSpentRequest(draft: SpentRequestDraft): string {
  return JSON.stringify(seal(draft));
}

export function decodeSpentRequest(json: string): SpentRequestRecord {
  const trimmed = json.trim();
  if (trimmed.length === 0) {
    throw new InputError('invalid-json', 'spent-request record is empty');
  }
  const { doc } = upgradeDocument(parseDocument(trimmed), SPENT_REQUEST_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!RECORD_KEYS.has(k)) {
      throw new InputError('invalid-type', `unexpected spent-request field: ${k}`, k);
    }
  }
  const checksum = doc.checksum;
  if (!isRecord(checksum) || checksum.algo !== 'sha256' || typeof checksum.hex !== 'string') {
    throw new InputError('mismatch', 'spent-request checksum missing or unsupported', 'checksum');
  }
  const expected = seal({
    id: doc.id as string,
    digest: doc.digest as string,
    publicKey: doc.publicKey as string,
    signedAt: doc.signedAt as string,
  });
  if (checksum.hex.toLowerCase() !== expected.checksum.hex) {
    throw new InputError('mismatch', 'spent-request checksum mismatch', 'checksum');
  }
  return expected;
}

export function findSpentRequest(records: readonly SpentRequestRecord[], id: string): SpentRequestRecord | undefined {
  const want = normalizeRequestId(id);
  return records.find((r) => r.id === want);
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function assertLineBudget(line: string): void {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes > MAX_SPENT_LINE_BYTES) {
    throw new InputError('invalid-length', `spent-request record exceeds ${MAX_SPENT_LINE_BYTES} bytes`);
  }
}

async function assertRegularFile(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new InputError('invalid-type', `spent-request log is not a regular file: ${path}`, 'spent-log');
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Read every sealed record. A missing file is an empty log.
 */
export async function readSpentLog(path: string): Promise<SpentRequestRecord[]> {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InputError('missing-value', 'spent-request log path is required', 'spent-log');
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const records: SpentRequestRecord[] = [];
  const seen = new Set<string>();
  for (const line of splitLines(text)) {
    assertLineBudget(line);
    const record = decodeSpentRequest(line);
    if (seen.has(record.id)) {
      throw new InputError('duplicate', `spent-request log already lists ${record.id}`, 'id');
    }
    seen.add(record.id);
    records.push(record);
  }
  return records;
}

/**
 * Append one sealed record with `O_APPEND`. Duplicate request ids are refused.
 */
export async function appendSpentRequest(path: string, draft: SpentRequestDraft): Promise<SpentRequestRecord> {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InputError('missing-value', 'spent-request log path is required', 'spent-log');
  }
  await assertRegularFile(path);
  const existing = await readSpentLog(path);
  const record = seal(draft);
  if (findSpentRequest(existing, record.id)) {
    throw new InputError('duplicate', `request ${record.id} was already signed`, 'id');
  }
  const line = JSON.stringify(record);
  assertLineBudget(line);
  await appendFile(path, `${line}\n`, { encoding: 'utf8', flag: 'a' });
  return record;
}
