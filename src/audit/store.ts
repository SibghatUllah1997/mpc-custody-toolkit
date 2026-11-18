import { appendFile, readFile, stat } from 'node:fs/promises';
import { DEFAULT_MAX_NDJSON_LINE_BYTES } from '../encoding/ndjson.js';
import {
  auditRecordHash,
  decodeAuditEvent,
  encodeAuditEvent,
  verifyAuditChain,
} from './encode.js';
import { AUDIT_GENESIS_PREV, type AuditDraft, type AuditEvent } from './types.js';

export const MAX_AUDIT_LINE_BYTES = DEFAULT_MAX_NDJSON_LINE_BYTES;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function assertLineBudget(line: string): void {
  const bytes = Buffer.byteLength(line, 'utf8');
  assert(bytes <= MAX_AUDIT_LINE_BYTES, `audit record exceeds ${MAX_AUDIT_LINE_BYTES} bytes`);
}

async function assertRegularFile(path: string): Promise<void> {
  try {
    const info = await stat(path);
    assert(info.isFile(), `audit log is not a regular file: ${path}`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Read every sealed event in `path` and verify the hash chain.
 * Missing files are an empty log. Blank lines are ignored.
 */
export async function readAuditLog(path: string): Promise<AuditEvent[]> {
  assert(typeof path === 'string' && path.length > 0, 'audit log path is required');
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const events: AuditEvent[] = [];
  for (const line of splitLines(text)) {
    assertLineBudget(line);
    events.push(decodeAuditEvent(line));
  }
  verifyAuditChain(events);
  return events;
}

export async function lastAuditEvent(path: string): Promise<AuditEvent | undefined> {
  const events = await readAuditLog(path);
  return events[events.length - 1];
}

/**
 * Append one sealed event with `O_APPEND`. The file is never truncated.
 * A broken existing chain is refused so a torn log cannot be extended.
 */
export async function appendAuditEvent(path: string, draft: AuditDraft): Promise<AuditEvent> {
  assert(typeof path === 'string' && path.length > 0, 'audit log path is required');
  assert(draft && typeof draft === 'object', 'audit draft must be an object');
  await assertRegularFile(path);
  const existing = await readAuditLog(path);
  const prevEvent = existing[existing.length - 1];
  const line = encodeAuditEvent({
    ...draft,
    seq: existing.length + 1,
    prev: prevEvent ? auditRecordHash(prevEvent) : AUDIT_GENESIS_PREV,
  });
  assertLineBudget(line);
  const event = decodeAuditEvent(line);
  await appendFile(path, `${line}\n`, { encoding: 'utf8', flag: 'a' });
  return event;
}
