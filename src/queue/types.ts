/**
 * A local pending-approval queue: one item per transfer, plus signed
 * receipts from distinct listed approvers. Pre-sign waits until `threshold`
 * receipts verify.
 */

import type { Transaction } from '../tx/types.js';

export const APPROVAL_QUEUE_TYPE = 'approval-queue' as const;
export const APPROVAL_QUEUE_VERSION = 1 as const;
export const APPROVAL_ITEM_TYPE = 'approval-item' as const;
export const APPROVAL_ITEM_VERSION = 1 as const;

export const APPROVAL_ID_BYTES = 8;
export const APPROVAL_CHECKSUM_HEX_LENGTH = 16;
export const RECEIPT_DIGEST_DOMAIN = 'mpc-custody-toolkit/approver-receipt/v1';

export const APPROVAL_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type Approver = {
  id: string;
  /** Compressed secp256k1 public key, 66 lowercase hex chars. */
  publicKey: string;
};

export type ApproverReceipt = {
  signerId: string;
  publicKey: string;
  /** Compact low-S ECDSA (r || s), 128 lowercase hex chars. */
  signature: string;
  createdAt: string;
};

export type ApprovalItemData = {
  id: string;
  createdAt: string;
  threshold: number;
  digest: string;
  tx?: Transaction;
  approvers: Approver[];
  receipts: ApproverReceipt[];
};

export type ApprovalItem = {
  version: typeof APPROVAL_ITEM_VERSION;
  type: typeof APPROVAL_ITEM_TYPE;
  data: ApprovalItemData;
  checksum: { algo: 'sha256'; hex: string };
};

export type ApprovalItemDraft = {
  threshold: number;
  approvers: Array<{ id: string; publicKey: string | Uint8Array }>;
  tx?: Transaction;
  digest?: string | Uint8Array;
  id?: string;
  createdAt?: string;
};

export type ApprovalQueue = {
  version: typeof APPROVAL_QUEUE_VERSION;
  type: typeof APPROVAL_QUEUE_TYPE;
  items: ApprovalItem[];
  checksum: { algo: 'sha256'; hex: string };
};

export type QueueReason = {
  code: string;
  message: string;
};

export type QueueStatus = {
  ready: boolean;
  id: string;
  threshold: number;
  receiptCount: number;
  needed: number;
  signerIds: string[];
  reasons: QueueReason[];
};
