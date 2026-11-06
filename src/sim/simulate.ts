import { parseDecimalInteger } from '../policy/amount.js';
import { validateTransaction } from '../tx/validate.js';
import type { Transaction } from '../tx/types.js';
import { countDataBytes, DEFAULT_COST_MODEL, estimateGas } from './cost.js';
import type { LimitCheck, SimulationInput, SimulationResult } from './types.js';

function checkLimit(
  limit: NonNullable<SimulationInput['limit']>,
  counted: bigint
): LimitCheck {
  const max = parseDecimalInteger(limit.maxValue, 'limit.maxValue');
  const within = counted <= max;
  return {
    asset: limit.asset,
    maxValue: limit.maxValue,
    counted: counted.toString(),
    withinLimit: within,
    headroom: (within ? max - counted : 0n).toString(),
    excess: (within ? 0n : counted - max).toString(),
  };
}

/**
 * Estimate gas, fee and total outflow for `tx` without touching any network.
 * Pure: same input, same output; the transaction is validated, never modified.
 */
export function simulateTransaction(tx: Transaction, input: SimulationInput): SimulationResult {
  validateTransaction(tx);
  if (!input || typeof input !== 'object') throw new Error('input must be an object');
  const gasPrice = parseDecimalInteger(input.gasPrice, 'gasPrice');
  const value = parseDecimalInteger(tx.value, 'value');

  const counts = countDataBytes(tx.data);
  const gas = estimateGas(counts, input.model ?? DEFAULT_COST_MODEL);
  const fee = gas * gasPrice;
  const total = value + fee;

  const result: SimulationResult = {
    dataBytes: counts.zero + counts.nonZero,
    zeroBytes: counts.zero,
    nonZeroBytes: counts.nonZero,
    gasUnits: gas.toString(),
    fee: fee.toString(),
    total: total.toString(),
  };
  if (input.limit) {
    result.limit = checkLimit(input.limit, input.includeFeeInLimit ? total : value);
  }
  return result;
}
