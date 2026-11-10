import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import { MAX_TOTAL_SHARES, MIN_THRESHOLD, type Share } from '../sss/shamir.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';

/** Domain-separated HMAC key material. Public; detects accidental corruption, not a secret. */
export const SHARE_MAC_DOMAIN = 'mpc-custody-toolkit/share-mac/v1';
export const SHARE_MAC_ALGO = 'hmac-sha256' as const;
export const SHARE_BACKUP_TYPE = 'shamir-share' as const;
/** Version written by `encodeShare`. */
export const SHARE_BACKUP_VERSION = 2 as const;

const SHARE_MAC_KEY = new TextEncoder().encode(SHARE_MAC_DOMAIN);
const SET_ID_BYTES = 8;

/**
 * Optional facts about the split a share came from. Shares cut from the same
 * secret in one split carry the same `id`, so mixing two splits is caught
 * before combine silently returns the wrong key.
 */
export type ShareSetInfo = {
  /** 16 lowercase hex chars (8 random bytes). */
  id: string;
  threshold: number;
  total: number;
};

export type ShareBackupV1 = {
  version: 1;
  type: 'shamir-share';
  data: {
    x: number;
    y: string; // 32-byte hex, lowercase, no 0x
  };
  checksum: {
    algo: 'sha256';
    hex: string; // first 16 hex chars (8 bytes) of sha256(JSON.stringify(data))
  };
  mac?: {
    algo: 'hmac-sha256';
    hex: string; // 32-byte HMAC-SHA256 over the canonical data JSON
  };
};

export type ShareBackupV2 = {
  version: 2;
  type: 'shamir-share';
  data: {
    x: number;
    y: string;
    set?: ShareSetInfo;
  };
  checksum: { algo: 'sha256'; hex: string };
  /** Required from v2 on. */
  mac: { algo: 'hmac-sha256'; hex: string };
};

export type DecodedShareBackup = {
  share: Share;
  set?: ShareSetInfo;
  /** Version found in the file before any upgrade. */
  sourceVersion: number;
};

function computeChecksumHex(data: unknown): string {
  const json = stableStringify(data);
  const digest = sha256(new TextEncoder().encode(json));
  // Use first 8 bytes (16 hex chars) as a compact checksum
  return bytesToHex(digest).slice(0, 16);
}

export function computeShareMacHex(data: unknown): string {
  const json = stableStringify(data);
  const digest = hmac(sha256, SHARE_MAC_KEY, new TextEncoder().encode(json));
  return bytesToHex(digest);
}

function macsEqual(aHex: string, bHex: string): boolean {
  let a: Uint8Array;
  let b: Uint8Array;
  try {
    a = hexToBytes(aHex);
    b = hexToBytes(bHex);
  } catch {
    return false;
  }
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Fresh random id for one split. */
export function newShareSetId(): string {
  return bytesToHex(randomBytes(SET_ID_BYTES));
}

export function validateShareSetInfo(set: unknown, x?: number): asserts set is ShareSetInfo {
  assert(isRecord(set), 'data.set must be an object');
  assert(typeof set.id === 'string' && /^[0-9a-f]{16}$/.test(set.id), 'data.set.id must be 16 lowercase hex chars');
  const { threshold, total } = set;
  assert(
    Number.isInteger(threshold) && (threshold as number) >= MIN_THRESHOLD,
    `data.set.threshold must be an integer >= ${MIN_THRESHOLD}`
  );
  assert(
    Number.isInteger(total) && (total as number) >= (threshold as number) && (total as number) <= MAX_TOTAL_SHARES,
    `data.set.total must be an integer in threshold..${MAX_TOTAL_SHARES}`
  );
  if (x !== undefined) {
    assert(x <= (total as number), 'data.x must not exceed data.set.total');
  }
}

function verifyChecksum(b: Record<string, unknown>): void {
  const checksum = b.checksum;
  assert(isRecord(checksum), 'missing checksum');
  assert(checksum.algo === 'sha256', 'unsupported checksum algo');
  assert(typeof checksum.hex === 'string', 'checksum.hex must be a string');
  assert(checksum.hex.toLowerCase() === computeChecksumHex(b.data), 'checksum mismatch');
}

function verifyMac(b: Record<string, unknown>, required: boolean): void {
  if (b.mac === undefined) {
    assert(!required, 'missing mac');
    return;
  }
  const mac = b.mac;
  assert(isRecord(mac), 'mac must be an object');
  assert(mac.algo === SHARE_MAC_ALGO, 'unsupported mac algo');
  assert(typeof mac.hex === 'string', 'mac.hex must be a string');
  assert(macsEqual(mac.hex.toLowerCase(), computeShareMacHex(b.data)), 'mac mismatch');
}

function integrity(data: unknown): Pick<ShareBackupV2, 'checksum' | 'mac'> {
  return {
    checksum: { algo: 'sha256', hex: computeChecksumHex(data) },
    mac: { algo: SHARE_MAC_ALGO, hex: computeShareMacHex(data) },
  };
}

/** v1 -> v2: check the old integrity rules, then re-seal with a mandatory MAC. */
function migrateShareV1(doc: Record<string, unknown>): Record<string, unknown> {
  assert(isRecord(doc.data), 'missing data section');
  verifyChecksum(doc);
  verifyMac(doc, false);
  const data = { x: doc.data.x, y: doc.data.y };
  return { data, ...integrity(data) };
}

export const SHARE_BACKUP_SCHEMA: SchemaSpec = {
  type: SHARE_BACKUP_TYPE,
  label: 'backup',
  minVersion: 1,
  currentVersion: SHARE_BACKUP_VERSION,
  migrations: { 1: migrateShareV1 },
};

export function encodeShare(share: Share, set?: ShareSetInfo): string {
  assert(Number.isInteger(share.x) && share.x > 0, 'share.x must be a positive integer');
  assert(share.y instanceof Uint8Array && share.y.length === 32, 'share.y must be 32 bytes');
  const data: ShareBackupV2['data'] = { x: share.x, y: bytesToHex(share.y) };
  if (set !== undefined) {
    validateShareSetInfo(set, share.x);
    data.set = { id: set.id, threshold: set.threshold, total: set.total };
  }
  const backup: ShareBackupV2 = {
    version: SHARE_BACKUP_VERSION,
    type: SHARE_BACKUP_TYPE,
    data,
    ...integrity(data),
  };
  return JSON.stringify(backup, null, 2);
}

/** Decode any readable backup version, upgrading old files to the current shape. */
export function decodeShareBackup(json: string): DecodedShareBackup {
  const raw = parseDocument(json);
  const { doc, sourceVersion } = upgradeDocument(raw, SHARE_BACKUP_SCHEMA);
  const data = doc.data;
  assert(isRecord(data), 'missing data section');
  assert(typeof data.x === 'number', 'data.x must be a number');
  assert(typeof data.y === 'string', 'data.y must be a string');
  verifyChecksum(doc);
  verifyMac(doc, true);
  const share = { x: data.x, y: hexToBytes(data.y, 32) };
  if (data.set === undefined) return { share, sourceVersion };
  validateShareSetInfo(data.set, data.x);
  const set = { id: data.set.id, threshold: data.set.threshold, total: data.set.total };
  return { share, set, sourceVersion };
}

export function decodeShare(json: string): Share {
  return decodeShareBackup(json).share;
}

/**
 * Check that decoded backups can be combined: all from one split (or none
 * tagged), and at least `threshold` of them. Untagged v1 files mixed with
 * tagged ones are rejected because their origin cannot be confirmed.
 */
export function assertCompatibleShareSet(backups: Array<Pick<DecodedShareBackup, 'set'>>): ShareSetInfo | undefined {
  if (backups.length === 0) return undefined;
  const tagged = backups.filter((b) => b.set !== undefined);
  if (tagged.length === 0) return undefined;
  assert(tagged.length === backups.length, 'cannot mix shares with and without split metadata');
  const first = tagged[0].set!;
  for (const b of tagged) {
    const s = b.set!;
    assert(s.id === first.id, `shares come from different splits (${first.id} vs ${s.id})`);
    assert(
      s.threshold === first.threshold && s.total === first.total,
      `shares in split ${first.id} disagree on threshold/total`
    );
  }
  assert(
    backups.length >= first.threshold,
    `split ${first.id} needs ${first.threshold} shares, got ${backups.length}`
  );
  return first;
}

export const ShareEncoding = {
  encodeShare,
  decodeShare,
  decodeShareBackup,
  assertCompatibleShareSet,
  newShareSetId,
  computeShareMacHex,
  SHARE_MAC_ALGO,
  SHARE_MAC_DOMAIN,
  SHARE_BACKUP_VERSION,
};
