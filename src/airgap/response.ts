import { InputError } from '../errors/input.js';
import { signHash, verifyHash } from '../crypto/ecdsa.js';
import { getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { parseDocument, upgradeDocument, type SchemaSpec } from '../schema/versioned.js';
import { assertNotExpired, isExpired } from '../time/parse.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { airgapChecksum, assertPolicySnapshotBinding, normalizePublicKey, normalizeRequestId } from './request.js';
import type {
  AirgapClock,
  AirgapSignOptions,
  AirgapSignRequest,
  AirgapSignResponse,
  AirgapVerifyCode,
  AirgapVerifyReport,
} from './types.js';

export const AIRGAP_RESPONSE_TYPE = 'airgap-sign-response' as const;
export const AIRGAP_RESPONSE_VERSION = 1 as const;

const RESPONSE_KEYS = new Set(['type', 'version', 'requestId', 'digest', 'publicKey', 'signature', 'checksum']);

export const AIRGAP_RESPONSE_SCHEMA: SchemaSpec = {
  type: AIRGAP_RESPONSE_TYPE,
  label: 'air-gap response',
  minVersion: 1,
  currentVersion: AIRGAP_RESPONSE_VERSION,
  migrations: {},
};

function normalizeSignature(hex: unknown): string {
  if (typeof hex !== 'string') throw new InputError('invalid-type', 'signature must be a hex string', 'signature');
  const sig = normalizeHex(hex);
  hexToBytes(sig, 64);
  return sig;
}

function normalizeDigest(hex: unknown): string {
  if (typeof hex !== 'string') throw new InputError('invalid-type', 'digest must be a hex string', 'digest');
  const digest = normalizeHex(hex);
  hexToBytes(digest, 32);
  return digest;
}

/**
 * Offline side: sign the request digest. Refuses when the key does not match
 * the public key named in the request, so the wrong device fails loudly
 * instead of producing a signature nobody can use.
 */
export function signAirgapRequest(
  req: AirgapSignRequest,
  privateKey: Uint8Array,
  opts?: AirgapSignOptions
): AirgapSignResponse {
  if (req.expiresAt !== undefined) {
    assertNotExpired(req.expiresAt, opts?.now ?? new Date());
  }
  assertPolicySnapshotBinding(req, opts?.policyDigest);
  const pub = bytesToHex(getPublicKeyCompressed(privateKey));
  if (pub !== req.publicKey) {
    throw new InputError('mismatch', 'signing key does not match the request public key', 'key');
  }
  const signature = bytesToHex(signHash(hexToBytes(req.digest, 32), privateKey));
  return Object.freeze({ requestId: req.id, digest: req.digest, publicKey: req.publicKey, signature });
}

function responseBody(res: AirgapSignResponse): Record<string, unknown> {
  return {
    version: AIRGAP_RESPONSE_VERSION,
    requestId: normalizeRequestId(res.requestId, 'requestId'),
    digest: normalizeDigest(res.digest),
    publicKey: normalizePublicKey(res.publicKey),
    signature: normalizeSignature(res.signature),
  };
}

export function encodeSignResponse(res: AirgapSignResponse): string {
  const body = responseBody(res);
  const doc = { type: AIRGAP_RESPONSE_TYPE, ...body, checksum: airgapChecksum(AIRGAP_RESPONSE_TYPE, body) };
  return JSON.stringify(doc, null, 2);
}

export function decodeSignResponse(json: string): AirgapSignResponse {
  const { doc } = upgradeDocument(parseDocument(json), AIRGAP_RESPONSE_SCHEMA);
  for (const k of Object.keys(doc)) {
    if (!RESPONSE_KEYS.has(k)) throw new InputError('invalid-type', `unexpected response field: ${k}`, k);
  }
  if (typeof doc.checksum !== 'string' || doc.checksum !== airgapChecksum(AIRGAP_RESPONSE_TYPE, doc)) {
    throw new InputError('mismatch', 'response checksum mismatch (file damaged or edited)', 'checksum');
  }
  const body = responseBody(doc as unknown as AirgapSignResponse);
  return Object.freeze({
    requestId: body.requestId as string,
    digest: body.digest as string,
    publicKey: body.publicKey as string,
    signature: body.signature as string,
  });
}

/**
 * Online side: check a returned signature against the original request.
 * The request is the source of truth; nothing in the response is trusted
 * except the signature bytes.
 */
export function verifyAirgapResponse(
  req: AirgapSignRequest,
  res: AirgapSignResponse,
  opts?: AirgapClock
): AirgapVerifyReport {
  const codes: AirgapVerifyCode[] = [];
  if (req.expiresAt !== undefined && isExpired(req.expiresAt, opts?.now ?? new Date())) {
    codes.push('expired');
  }
  if (res.requestId !== req.id) codes.push('request-id-mismatch');
  if (res.digest !== req.digest) codes.push('digest-mismatch');
  if (res.publicKey !== req.publicKey) codes.push('public-key-mismatch');
  const valid = verifyHash(hexToBytes(req.digest, 32), hexToBytes(res.signature, 64), hexToBytes(req.publicKey, 33));
  if (!valid) codes.push('bad-signature');
  return Object.freeze({
    ok: codes.length === 0,
    requestId: req.id,
    digest: req.digest,
    publicKey: req.publicKey,
    codes,
  });
}
