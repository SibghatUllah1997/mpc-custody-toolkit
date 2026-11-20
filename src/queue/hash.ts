import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { PUBLIC_KEY_COMPRESSED_BYTES } from '../crypto/ecdsa.js';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import {
  APPROVAL_CHECKSUM_HEX_LENGTH,
  APPROVAL_ID_BYTES,
  APPROVAL_TS_RE,
  RECEIPT_DIGEST_DOMAIN,
} from './types.js';

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function newApprovalId(): string {
  return bytesToHex(randomBytes(APPROVAL_ID_BYTES));
}

export function utcTimestamp(now: Date = new Date()): string {
  const iso = now.toISOString();
  if (!APPROVAL_TS_RE.test(iso)) throw new Error('failed to format UTC timestamp');
  return iso;
}

export function computeApprovalChecksumHex(data: unknown): string {
  const digest = sha256(new TextEncoder().encode(stableStringify(data)));
  return bytesToHex(digest).slice(0, APPROVAL_CHECKSUM_HEX_LENGTH);
}

export function normalizePublicKeyHex(value: string | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : hexToBytes(value, PUBLIC_KEY_COMPRESSED_BYTES);
  assert(bytes.length === PUBLIC_KEY_COMPRESSED_BYTES, 'publicKey must be a compressed secp256k1 point');
  if (!secp256k1.utils.isValidPublicKey(bytes, true)) {
    throw new Error('publicKey must be a compressed secp256k1 point');
  }
  return bytesToHex(bytes);
}

export function normalizeDigestHex(value: string | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : hexToBytes(value, 32);
  assert(bytes.length === 32, 'digest must be 32 bytes');
  return bytesToHex(bytes);
}

/**
 * Domain-separated 32-byte hash of one receipt: request id, signer id, and
 * the payload digest. A receipt for one item cannot be replayed onto another.
 */
export function receiptDigest(input: { requestId: string; signerId: string; digest: string }): Uint8Array {
  assert(typeof input.requestId === 'string' && input.requestId.length > 0, 'requestId is required');
  assert(typeof input.signerId === 'string' && input.signerId.length > 0, 'signerId is required');
  const digest = normalizeDigestHex(input.digest);
  const payload = {
    domain: RECEIPT_DIGEST_DOMAIN,
    requestId: input.requestId,
    signerId: input.signerId,
    digest,
  };
  return sha256(new TextEncoder().encode(stableStringify(payload)));
}
