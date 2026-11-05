import { freezeTransaction } from './validate.js';
import type { Transaction } from './types.js';

export const TX_TYPE = 'transaction' as const;

export type TransactionEnvelopeV1 = {
  version: 1;
  type: typeof TX_TYPE;
  tx: Transaction;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function encodeTransaction(tx: Transaction): string {
  const frozen = freezeTransaction(tx);
  const envelope: TransactionEnvelopeV1 = {
    version: 1,
    type: TX_TYPE,
    tx: { from: frozen.from, to: frozen.to, value: frozen.value, data: frozen.data },
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse a v1 transaction envelope and re-validate every field.
 */
export function decodeTransaction(json: string): Transaction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  assert(parsed !== null && typeof parsed === 'object', 'envelope must be an object');
  const env = parsed as Partial<TransactionEnvelopeV1>;
  assert(env.version === 1, 'unsupported transaction version');
  assert(env.type === TX_TYPE, 'unsupported transaction type');
  assert(env.tx !== null && typeof env.tx === 'object', 'missing tx section');
  return freezeTransaction(env.tx as Transaction);
}
