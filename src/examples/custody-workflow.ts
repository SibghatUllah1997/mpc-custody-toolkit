import {
  exportShareBackupNdjson,
  importShareBackupNdjson,
  sharesFromBackupStream,
} from '../encoding/stream.js';
import { newShareSetId, type ShareSetInfo } from '../encoding/share.js';
import {
  decodeStore,
  encodeStore,
  MemoryPolicyStore,
  type Policy,
} from '../policy/index.js';
import { runPreSign } from '../presign/pipeline.js';
import {
  setupThresholdKey,
  signTransactionWithShares,
  verifyThresholdTransaction,
} from '../threshold/demo.js';
import type { Transaction } from '../tx/types.js';
import { bytesToHex } from '../utils/bytes.js';

export const SAMPLE_POLICY: Policy = {
  id: 'vault-ops',
  name: 'Operations vault',
  signers: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100' }],
};

export const SAMPLE_TX: Transaction = {
  from: 'aa11',
  to: 'bb22',
  value: '25',
  data: '',
};

export type CustodyWorkflowInput = {
  /** Path to write the NDJSON share backup. */
  backupPath: string;
  policy?: Policy;
  tx?: Transaction;
  approvals?: string[];
  asset?: string;
};

export type CustodyWorkflowResult = {
  publicKey: string;
  set: ShareSetInfo;
  policyJson: string;
  preSignOk: boolean;
  usedShareXs: number[];
  signature: string;
  verified: boolean;
};

/**
 * One custody pass: mint a 2-of-3 key, stream the shares to NDJSON, load a
 * policy, run pre-sign, then reconstruct two shares and sign the transfer.
 */
export async function runCustodyWorkflow(input: CustodyWorkflowInput): Promise<CustodyWorkflowResult> {
  const setup = setupThresholdKey({ threshold: 2, total: 3 });
  const set: ShareSetInfo = {
    id: newShareSetId(),
    threshold: setup.threshold,
    total: setup.total,
  };
  await exportShareBackupNdjson(
    input.backupPath,
    setup.shares.map((share) => ({ share, set }))
  );

  const policy = input.policy ?? SAMPLE_POLICY;
  const store = new MemoryPolicyStore();
  store.upsert(policy);
  const policyJson = encodeStore(store);
  const stored = decodeStore(policyJson).get(policy.id);
  if (!stored) throw new Error('policy did not round-trip through the store snapshot');

  const tx = input.tx ?? SAMPLE_TX;
  const pre = runPreSign({
    tx,
    policy: stored,
    asset: input.asset ?? 'ETH',
    approvals: input.approvals ?? ['alice', 'bob'],
    gasPrice: '1',
  });
  if (!pre.ok) {
    throw new Error(pre.reasons[0]?.message ?? 'pre-sign denied');
  }

  const backups = await importShareBackupNdjson(input.backupPath);
  const shares = sharesFromBackupStream(backups.slice(0, 2));
  const signed = signTransactionWithShares(shares, tx, setup.publicKey);
  const verified = verifyThresholdTransaction(tx, signed);

  return {
    publicKey: bytesToHex(setup.publicKey),
    set,
    policyJson,
    preSignOk: pre.ok,
    usedShareXs: signed.usedShareXs,
    signature: bytesToHex(signed.signature),
    verified,
  };
}
