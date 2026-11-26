/**
 * Append-only JSONL log of spends this machine has already allowed.
 * A rolling window reads this file; deleting a line lets that amount
 * leave the window early, same as a local spent-request log.
 */

import { appendFile, readFile, stat } from 'node:fs/promises';
import { sha256 } from '@noble/hashes/sha256';
import { DEFAULT_MAX_NDJSON_LINE_BYTES } from '../encoding/ndjson.js';
import { InputError } from '../errors/input.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { formatUtcTimestamp, parseUtcTimestamp } from '../time/parse.js';
import { bytesToHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import { parseDecimalInteger } from './amount.js';
import { isAssetCode } from './validate.js';
import type { SpendActivity, SpendEvent } from './window.js';

export const SPEND_EVENT_TYPE = 'spend-event' as const;
export const SPEND_EVENT_VERSION = 1 as const;
export const SPEND_CHECKSUM_HEX_LENGTH = 16;
export const MAX_SPEND_LINE_BYTES = DEFAULT_MAX_NDJSON_LINE_BYTES;

export type SpendLogDraft = {
  asset: string;
  value: string;
  at?: string;
};

export type SpendLogRecord = {
  version: typeof SPEND_EVENT_VERSION;
  type: typeof SPEND_EVENT_TYPE;
  asset: string;
  value: string;
  at: string;
  checksum: { algo: 'sha256'; hex: string };
};

const RECORD_KEYS = new Set(['type', 'version', 'asset', 'value', 'at', 'checksum']);

export const SPEND_EVENT_SCHEMA: SchemaSpec = {
  type: SPEND_EVENT_TYPE,
  label: 'spend-event record',
  minVersion: 1,
  currentVersion: SPEND_EVENT_VERSION,
  migrations: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checksumPayload(record: Omit<SpendLogRecord, 'checksum'>): Record<string, unknown> {
  return {
    version: record.version,
    type: record.type,
    asset: record.asset,
    value: record.value,
    at: record.at,
  };
}

export function computeSpendChecksumHex(record: Omit<SpendLogRecord, 'checksum'>): string {
  const digest = sha256(new TextEncoder().encode(stableStringify(checksumPayload(record))));
  return bytesToHex(digest).slice(0, SPEND_CHECKSUM_HEX_LENGTH);
}

function seal(draft: SpendLogDraft): SpendLogRecord {
  if (!draft || typeof draft !== 'object') {
    throw new InputError('invalid-type', 'spend-event draft must be an object');
  }
  if (!isAssetCode(draft.asset)) {
    throw new InputError('invalid-type', 'spend asset is not a valid asset code', 'asset');
  }
  parseDecimalInteger(draft.value, 'value');
  const unsigned: Omit<SpendLogRecord, 'checksum'> = {
    version: SPEND_EVENT_VERSION,
    type: SPEND_EVENT_TYPE,
    asset: draft.asset,
    value: draft.value,
    at: formatUtcTimestamp(parseUtcTimestamp(draft.at ?? formatUtcTimestamp(), 'at')),
  };
  return {
    ...unsigned,
    checksum: { algo: 'sha256', hex: computeSpendChecksumHex(unsigned) },
  };
}

/** Compact JSONL line, no trailing newline. */
export function encodeSpendEvent(draft: SpendLogDraft): string {
  return JSON.stringify(seal(draft));
}

export function decodeSpendEvent(json: string): SpendLogRecord {
  const trimmed = json.trim();
  if (trimmed.length === 0) {
    throw new InputError('invalid-json', 'spend-event record is empty');
  }
  const { doc } = upgradeDocument(parseDocument(trimmed), SPEND_EVENT_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!RECORD_KEYS.has(k)) {
      throw new InputError('invalid-type', `unexpected spend-event field: ${k}`, k);
    }
  }
  const checksum = doc.checksum;
  if (!isRecord(checksum) || checksum.algo !== 'sha256' || typeof checksum.hex !== 'string') {
    throw new InputError('mismatch', 'spend-event checksum missing or unsupported', 'checksum');
  }
  const expected = seal({
    asset: doc.asset as string,
    value: doc.value as string,
    at: doc.at as string,
  });
  if (checksum.hex.toLowerCase() !== expected.checksum.hex) {
    throw new InputError('mismatch', 'spend-event checksum mismatch', 'checksum');
  }
  return expected;
}

/** Convert sealed log records into the history `evaluatePolicy` expects. */
export function spendActivityFromLog(records: readonly SpendLogRecord[], now: Date): SpendActivity {
  const history: SpendEvent[] = records.map((record) => ({
    asset: record.asset,
    value: record.value,
    at: Math.floor(parseUtcTimestamp(record.at, 'at').getTime() / 1000),
  }));
  return { now: Math.floor(now.getTime() / 1000), history };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function assertLineBudget(line: string): void {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes > MAX_SPEND_LINE_BYTES) {
    throw new InputError('invalid-length', `spend-event record exceeds ${MAX_SPEND_LINE_BYTES} bytes`);
  }
}

async function assertRegularFile(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new InputError('invalid-type', `spend log is not a regular file: ${path}`, 'file');
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}

/** Read every sealed record. A missing file is an empty log. */
export async function readSpendLog(path: string): Promise<SpendLogRecord[]> {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InputError('missing-value', 'spend log path is required', 'file');
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const records: SpendLogRecord[] = [];
  for (const line of splitLines(text)) {
    assertLineBudget(line);
    records.push(decodeSpendEvent(line));
  }
  return records;
}

/** Append one sealed record with `O_APPEND`. The file is created if missing. */
export async function appendSpendEvent(path: string, draft: SpendLogDraft): Promise<SpendLogRecord> {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InputError('missing-value', 'spend log path is required', 'file');
  }
  await assertRegularFile(path);
  const record = seal(draft);
  const line = JSON.stringify(record);
  assertLineBudget(line);
  await appendFile(path, `${line}\n`, { encoding: 'utf8', flag: 'a' });
  return record;
}
