import { sha256 } from '@noble/hashes/sha256';
import { stableStringify } from '../utils/json.js';
import { freezeTransaction } from './validate.js';
import { TX_TYPE } from './serialize.js';
import type { Transaction } from './types.js';

/** Domain tag mixed into the digest so a raw transfer cannot be confused with other objects. */
export const TX_DIGEST_DOMAIN = 'mpc-custody-toolkit/tx-digest/v1';

/**
 * SHA-256 of the canonical transaction JSON (normalized hex, sorted keys).
 * The digest is 32 bytes and is stable across key order and 0x prefix variants.
 */
export function transactionDigest(tx: Transaction): Uint8Array {
  const frozen = freezeTransaction(tx);
  const payload = {
    domain: TX_DIGEST_DOMAIN,
    type: TX_TYPE,
    version: 1,
    from: frozen.from,
    to: frozen.to,
    value: frozen.value,
    data: frozen.data,
  };
  return sha256(new TextEncoder().encode(stableStringify(payload)));
}
