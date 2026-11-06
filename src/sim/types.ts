import type { SpendLimit } from '../policy/types.js';

/**
 * Mock cost model. All amounts are canonical decimal integer strings.
 * The numbers are illustrative; they do not describe any real network.
 */
export type CostModel = {
  /** Flat cost charged for every transaction. */
  baseGas: string;
  /** Cost per zero byte of calldata. */
  zeroByteGas: string;
  /** Cost per non-zero byte of calldata. */
  nonZeroByteGas: string;
};

export type SimulationInput = {
  /** Price of one gas unit, in the same smallest unit as `value`. */
  gasPrice: string;
  /** Optional cost model; defaults to DEFAULT_COST_MODEL. */
  model?: CostModel;
  /** Optional spend limit to check the estimate against. */
  limit?: SpendLimit;
  /** When true, the fee counts toward the limit as well as the value. */
  includeFeeInLimit?: boolean;
};

export type LimitCheck = {
  asset: string;
  maxValue: string;
  /** The amount compared against `maxValue`. */
  counted: string;
  withinLimit: boolean;
  /** `maxValue - counted` when within the limit, otherwise "0". */
  headroom: string;
  /** `counted - maxValue` when over the limit, otherwise "0". */
  excess: string;
};

export type SimulationResult = {
  dataBytes: number;
  zeroBytes: number;
  nonZeroBytes: number;
  gasUnits: string;
  fee: string;
  /** `value + fee`. */
  total: string;
  limit?: LimitCheck;
};
