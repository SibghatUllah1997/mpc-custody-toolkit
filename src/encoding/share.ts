import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import type { Share } from '../sss/shamir.js';

/** Domain-separated HMAC key material. Public; detects accidental corruption, not a secret. */
export const SHARE_MAC_DOMAIN = 'mpc-custody-toolkit/share-mac/v1';
export const SHARE_MAC_ALGO = 'hmac-sha256' as const;

const SHARE_MAC_KEY = new TextEncoder().encode(SHARE_MAC_DOMAIN);

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

export function encodeShare(share: Share): string {
  assert(Number.isInteger(share.x) && share.x > 0, 'share.x must be a positive integer');
  assert(share.y instanceof Uint8Array && share.y.length === 32, 'share.y must be 32 bytes');
  const data = { x: share.x, y: bytesToHex(share.y) };
  const backup: ShareBackupV1 = {
    version: 1,
    type: 'shamir-share',
    data,
    checksum: { algo: 'sha256', hex: computeChecksumHex(data) },
    mac: { algo: SHARE_MAC_ALGO, hex: computeShareMacHex(data) },
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
  if (b.mac !== undefined) {
    assert(typeof b.mac === 'object' && b.mac !== null, 'mac must be an object');
    assert(b.mac.algo === SHARE_MAC_ALGO, 'unsupported mac algo');
    assert(typeof b.mac.hex === 'string', 'mac.hex must be a string');
    const macWant = b.mac.hex.toLowerCase();
    const macHave = computeShareMacHex(b.data);
    assert(macsEqual(macWant, macHave), 'mac mismatch');
  }
  return { x: b.data!.x as number, y: hexToBytes(b.data!.y as string, 32) };
}

export const ShareEncoding = {
  encodeShare,
  decodeShare,
  computeShareMacHex,
  SHARE_MAC_ALGO,
  SHARE_MAC_DOMAIN,
};

