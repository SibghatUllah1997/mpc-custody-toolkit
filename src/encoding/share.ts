import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import type { Share } from '../sss/shamir.js';

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
};

function computeChecksumHex(data: unknown): string {
  const json = stableStringify(data);
  const digest = sha256(new TextEncoder().encode(json));
  // Use first 8 bytes (16 hex chars) as a compact checksum
  return bytesToHex(digest).slice(0, 16);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function encodeShare(share: Share): string {
  assert(Number.isInteger(share.x) && share.x > 0, 'share.x must be a positive integer');
  assert(share.y instanceof Uint8Array && share.y.length === 32, 'share.y must be 32 bytes');
  const data = { x: share.x, y: bytesToHex(share.y) };
  const backup: ShareBackupV1 = {
    version: 1,
    type: 'shamir-share',
    data,
    checksum: { algo: 'sha256', hex: computeChecksumHex(data) },
  };
  return JSON.stringify(backup, null, 2);
}

export function decodeShare(json: string): Share {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  const b = parsed as Partial<ShareBackupV1>;
  assert(b && typeof b === 'object', 'backup must be an object');
  assert(b.version === 1, 'unsupported backup version');
  assert(b.type === 'shamir-share', 'unsupported backup type');
  assert(b.data && typeof b.data === 'object', 'missing data section');
  assert(typeof b.data!.x === 'number', 'data.x must be a number');
  assert(typeof b.data!.y === 'string', 'data.y must be a string');
  assert(b.checksum && typeof b.checksum === 'object', 'missing checksum');
  assert(b.checksum!.algo === 'sha256', 'unsupported checksum algo');
  assert(typeof b.checksum!.hex === 'string', 'checksum.hex must be a string');
  const want = (b.checksum!.hex as string).toLowerCase();
  const have = computeChecksumHex(b.data);
  assert(want === have, 'checksum mismatch');
  return { x: b.data!.x as number, y: hexToBytes(b.data!.y as string, 32) };
}

export const ShareEncoding = {
  encodeShare,
  decodeShare,
};

