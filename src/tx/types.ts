/**
 * Chain-agnostic transfer: who pays, who receives, how much, and optional calldata.
 * Addresses and data are lowercase hex without a 0x prefix.
 * Value is a canonical non-negative decimal integer string.
 */

export type Transaction = {
  from: string;
  to: string;
  value: string;
  data: string;
};
