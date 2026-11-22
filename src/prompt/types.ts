import type { PersonalMessageSource, TypedData } from '../eip/index.js';
import type { PolicyDecision } from '../policy/types.js';
import type { SimulationResult } from '../sim/types.js';
import type { Transaction } from '../tx/types.js';

/**
 * A frozen, line-oriented explanation of what a signer is about to approve.
 * `text` is `lines` joined with newlines (no trailing newline).
 */
export type SigningPrompt = {
  title: string;
  lines: string[];
  text: string;
  digestHex: string;
};

export type SigningPromptInput = {
  tx: Transaction;
  /** Optional ticker shown next to the value (for example ETH). */
  asset?: string;
  /** Compressed public key shown with its EIP-55 address, if known. */
  publicKeyHex?: string;
  /** Optional policy outcome already computed by pre-sign. */
  policy?: PolicyDecision;
  /** Optional mock simulation already computed by pre-sign. */
  simulation?: SimulationResult;
};

export type DigestPromptInput = {
  digestHex: string;
  /** Share indexes that will take part in an offline combine, if known. */
  usedShareXs?: number[];
  /** Compressed public key hex the signature must match, if known. */
  publicKeyHex?: string;
};

/** EIP-191 personal_sign payload shown to a signer. */
export type PersonalPromptInput = PersonalMessageSource;

/** EIP-712 typed data shown to a signer. */
export type TypedDataPromptInput = {
  typedData: TypedData;
};
