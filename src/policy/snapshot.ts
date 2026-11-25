/**
 * A signed copy of one custody policy. The online machine exports it; the
 * offline machine checks the signature (and optional expiry) before signing.
 */

import { sha256 } from '@noble/hashes/sha256';
import {
  PUBLIC_KEY_COMPRESSED_BYTES,
  SIGNATURE_COMPACT_BYTES,
  signHash,
  verifyHash,
} from '../crypto/ecdsa.js';
import { getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { InputError } from '../errors/input.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { assertNotExpired, formatUtcTimestamp, parseUtcTimestamp } from '../time/parse.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { stableStringify } from '../utils/json.js';
import type { Policy } from './types.js';
import { freezePolicy } from './validate.js';

export const POLICY_SNAPSHOT_TYPE = 'policy-snapshot' as const;
export const POLICY_SNAPSHOT_VERSION = 1 as const;
export const POLICY_SNAPSHOT_DOMAIN = 'mpc-custody-toolkit/policy-snapshot/v1';

const SNAPSHOT_KEYS = new Set([
  'type',
  'version',
  'createdAt',
  'expiresAt',
  'policy',
  'publicKey',
  'digest',
  'signature',
]);

export type PolicySnapshot = {
  version: typeof POLICY_SNAPSHOT_VERSION;
  type: typeof POLICY_SNAPSHOT_TYPE;
  createdAt: string;
  expiresAt?: string;
  policy: Policy;
  publicKey: string;
  digest: string;
  signature: string;
};

export type PolicySnapshotInput = {
  policy: Policy;
  privateKey: Uint8Array;
  createdAt?: string;
  expiresAt?: string;
  now?: Date;
};

export const POLICY_SNAPSHOT_SCHEMA: SchemaSpec = {
  type: POLICY_SNAPSHOT_TYPE,
  label: 'policy snapshot',
  minVersion: 1,
  currentVersion: POLICY_SNAPSHOT_VERSION,
  migrations: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePublicKeyHex(hex: unknown, field = 'publicKey'): string {
  if (typeof hex !== 'string') {
    throw new InputError('invalid-type', `${field} must be a hex string`, field);
  }
  const pub = normalizeHex(hex);
  hexToBytes(pub, PUBLIC_KEY_COMPRESSED_BYTES);
  return pub;
}

function snapshotBody(policy: Policy, createdAt: string, expiresAt: string | undefined): Record<string, unknown> {
  const body: Record<string, unknown> = {
    domain: POLICY_SNAPSHOT_DOMAIN,
    createdAt,
    policy,
  };
  if (expiresAt !== undefined) body.expiresAt = expiresAt;
  return body;
}

/** Domain-separated SHA-256 of the canonical policy body. */
export function policySnapshotDigest(
  policy: Policy,
  createdAt: string,
  expiresAt?: string
): Uint8Array {
  const frozen = freezePolicy(policy);
  return sha256(new TextEncoder().encode(stableStringify(snapshotBody(frozen, createdAt, expiresAt))));
}

function freezeSnapshot(snap: PolicySnapshot): PolicySnapshot {
  const out: PolicySnapshot = {
    version: POLICY_SNAPSHOT_VERSION,
    type: POLICY_SNAPSHOT_TYPE,
    createdAt: snap.createdAt,
    policy: freezePolicy(snap.policy),
    publicKey: snap.publicKey,
    digest: snap.digest,
    signature: snap.signature,
  };
  if (snap.expiresAt !== undefined) out.expiresAt = snap.expiresAt;
  return Object.freeze(out);
}

/**
 * Sign a frozen copy of `policy`. The private key is the policy-signer key
 * the offline machine is told to trust, not the spending key.
 */
export function signPolicySnapshot(input: PolicySnapshotInput): PolicySnapshot {
  if (!isRecord(input)) throw new InputError('invalid-type', 'snapshot input must be an object');
  const now = input.now ?? new Date();
  const createdAt =
    input.createdAt === undefined
      ? formatUtcTimestamp(now)
      : formatUtcTimestamp(parseUtcTimestamp(input.createdAt, 'createdAt'));
  const expiresAt =
    input.expiresAt === undefined
      ? undefined
      : formatUtcTimestamp(parseUtcTimestamp(input.expiresAt, 'expiresAt'));
  if (expiresAt !== undefined) assertNotExpired(expiresAt, now);
  const policy = freezePolicy(input.policy);
  const digest = policySnapshotDigest(policy, createdAt, expiresAt);
  const signature = signHash(digest, input.privateKey);
  const publicKey = bytesToHex(getPublicKeyCompressed(input.privateKey));
  return freezeSnapshot({
    version: POLICY_SNAPSHOT_VERSION,
    type: POLICY_SNAPSHOT_TYPE,
    createdAt,
    expiresAt,
    policy,
    publicKey,
    digest: bytesToHex(digest),
    signature: bytesToHex(signature),
  });
}

export function encodePolicySnapshot(snapshot: PolicySnapshot): string {
  // Digest and signature only; expiry is checked on verify/decode. Use
  // createdAt so writing JSON does not depend on the wall clock.
  if (!isRecord(snapshot)) throw new InputError('invalid-type', 'policy snapshot must be an object');
  const created = parseUtcTimestamp(snapshot.createdAt, 'createdAt');
  const checked = verifyPolicySnapshot(snapshot, { now: created });
  const doc: Record<string, unknown> = {
    type: POLICY_SNAPSHOT_TYPE,
    version: POLICY_SNAPSHOT_VERSION,
    createdAt: checked.createdAt,
    policy: checked.policy,
    publicKey: checked.publicKey,
    digest: checked.digest,
    signature: checked.signature,
  };
  if (checked.expiresAt !== undefined) doc.expiresAt = checked.expiresAt;
  return JSON.stringify(doc, null, 2);
}

/**
 * Recompute the digest and check the compact signature. When `publicKey` is
 * given it must match the key that signed the file. Expired snapshots fail.
 */
export function verifyPolicySnapshot(
  snapshot: PolicySnapshot,
  opts?: { publicKey?: string | Uint8Array; now?: Date }
): PolicySnapshot {
  if (!isRecord(snapshot)) throw new InputError('invalid-type', 'policy snapshot must be an object');
  const policy = freezePolicy(snapshot.policy);
  const createdAt = formatUtcTimestamp(parseUtcTimestamp(snapshot.createdAt, 'createdAt'));
  const expiresAt =
    snapshot.expiresAt === undefined
      ? undefined
      : formatUtcTimestamp(parseUtcTimestamp(snapshot.expiresAt, 'expiresAt'));
  const now = opts?.now ?? new Date();
  if (expiresAt !== undefined) assertNotExpired(expiresAt, now);
  const digest = policySnapshotDigest(policy, createdAt, expiresAt);
  const digestHex = bytesToHex(digest);
  if (typeof snapshot.digest !== 'string' || normalizeHex(snapshot.digest) !== digestHex) {
    throw new InputError('mismatch', 'policy snapshot digest mismatch', 'digest');
  }
  const publicKey = normalizePublicKeyHex(snapshot.publicKey);
  if (opts?.publicKey !== undefined) {
    const trusted =
      opts.publicKey instanceof Uint8Array ? bytesToHex(opts.publicKey) : normalizePublicKeyHex(opts.publicKey, 'pubkey');
    if (trusted !== publicKey) {
      throw new InputError('mismatch', 'policy snapshot public key does not match the trusted key', 'publicKey');
    }
  }
  if (typeof snapshot.signature !== 'string') {
    throw new InputError('invalid-type', 'signature must be a hex string', 'signature');
  }
  const signature = hexToBytes(snapshot.signature, SIGNATURE_COMPACT_BYTES);
  const ok = verifyHash(digest, signature, hexToBytes(publicKey, PUBLIC_KEY_COMPRESSED_BYTES));
  if (!ok) {
    throw new InputError('mismatch', 'policy snapshot signature does not verify', 'signature');
  }
  return freezeSnapshot({
    version: POLICY_SNAPSHOT_VERSION,
    type: POLICY_SNAPSHOT_TYPE,
    createdAt,
    expiresAt,
    policy,
    publicKey,
    digest: digestHex,
    signature: bytesToHex(signature),
  });
}

export function decodePolicySnapshot(json: string, opts?: { publicKey?: string | Uint8Array; now?: Date }): PolicySnapshot {
  const { doc } = upgradeDocument(parseDocument(json), POLICY_SNAPSHOT_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!SNAPSHOT_KEYS.has(k)) throw new InputError('invalid-type', `unexpected snapshot field: ${k}`, k);
  }
  if (!isRecord(doc.policy)) throw new InputError('invalid-type', 'policy must be an object', 'policy');
  if (typeof doc.createdAt !== 'string') {
    throw new InputError('invalid-type', 'createdAt must be an ISO-8601 UTC timestamp', 'createdAt');
  }
  if (typeof doc.digest !== 'string') throw new InputError('invalid-type', 'digest must be a hex string', 'digest');
  if (typeof doc.signature !== 'string') {
    throw new InputError('invalid-type', 'signature must be a hex string', 'signature');
  }
  let expiresAt: string | undefined;
  if (doc.expiresAt !== undefined) {
    if (typeof doc.expiresAt !== 'string') {
      throw new InputError('invalid-type', 'expiresAt must be an ISO-8601 UTC timestamp', 'expiresAt');
    }
    expiresAt = doc.expiresAt;
  }
  return verifyPolicySnapshot(
    {
      version: POLICY_SNAPSHOT_VERSION,
      type: POLICY_SNAPSHOT_TYPE,
      createdAt: doc.createdAt,
      expiresAt,
      policy: doc.policy as Policy,
      publicKey: doc.publicKey as string,
      digest: doc.digest,
      signature: doc.signature,
    },
    opts
  );
}
