import { PUBLIC_KEY_COMPRESSED_BYTES, SIGNATURE_COMPACT_BYTES, signHash, verifyHash } from '../crypto/ecdsa.js';
import { getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { isSignerId } from '../policy/validate.js';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';
import { assert, normalizePublicKeyHex, receiptDigest, utcTimestamp } from './hash.js';
import type { ApprovalItem, ApproverReceipt } from './types.js';

export function freezeReceipt(receipt: ApproverReceipt): ApproverReceipt {
  assert(receipt && typeof receipt === 'object', 'receipt must be an object');
  assert(isSignerId(receipt.signerId), `signerId is not a valid signer id: ${String(receipt.signerId)}`);
  const publicKey = normalizePublicKeyHex(receipt.publicKey);
  const signatureBytes =
    typeof receipt.signature === 'string' ? hexToBytes(receipt.signature, SIGNATURE_COMPACT_BYTES) : null;
  assert(signatureBytes !== null, 'signature must be a hex string');
  assert(
    typeof receipt.createdAt === 'string' && receipt.createdAt.length > 0,
    'receipt createdAt must be a timestamp'
  );
  return {
    signerId: receipt.signerId,
    publicKey,
    signature: bytesToHex(signatureBytes),
    createdAt: receipt.createdAt,
  };
}

/**
 * Sign a receipt for `item` as `signerId`. The private key must match that
 * approver's listed public key.
 */
export function issueReceipt(
  item: ApprovalItem,
  signerId: string,
  privateKey: Uint8Array,
  now?: Date
): ApproverReceipt {
  assert(item && typeof item === 'object' && item.data, 'approval item must be an object');
  assert(isSignerId(signerId), `signerId is not a valid signer id: ${String(signerId)}`);
  const approver = item.data.approvers.find((a) => a.id === signerId);
  assert(approver !== undefined, `unknown approver: ${signerId}`);
  const publicKey = getPublicKeyCompressed(privateKey);
  assert(bytesToHex(publicKey) === approver.publicKey, `private key does not match approver ${signerId}`);
  const digest = receiptDigest({
    requestId: item.data.id,
    signerId,
    digest: item.data.digest,
  });
  const signature = signHash(digest, privateKey);
  return freezeReceipt({
    signerId,
    publicKey: bytesToHex(publicKey),
    signature: bytesToHex(signature),
    createdAt: utcTimestamp(now),
  });
}

export function verifyReceipt(item: ApprovalItem, receipt: ApproverReceipt): void {
  const frozen = freezeReceipt(receipt);
  const approver = item.data.approvers.find((a) => a.id === frozen.signerId);
  assert(approver !== undefined, `unknown approver: ${frozen.signerId}`);
  assert(
    frozen.publicKey === approver.publicKey,
    `receipt public key does not match approver ${frozen.signerId}`
  );
  const digest = receiptDigest({
    requestId: item.data.id,
    signerId: frozen.signerId,
    digest: item.data.digest,
  });
  const ok = verifyHash(
    digest,
    hexToBytes(frozen.signature, SIGNATURE_COMPACT_BYTES),
    hexToBytes(frozen.publicKey, PUBLIC_KEY_COMPRESSED_BYTES)
  );
  assert(ok, `receipt signature does not verify for ${frozen.signerId}`);
}
