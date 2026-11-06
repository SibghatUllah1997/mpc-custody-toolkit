import { parseDecimalInteger } from '../policy/amount.js';
import { hexToBytes } from '../utils/bytes.js';
import { normalizeData } from '../tx/validate.js';
import type { CostModel } from './types.js';

export const DEFAULT_COST_MODEL: Readonly<CostModel> = Object.freeze({
  baseGas: '21000',
  zeroByteGas: '4',
  nonZeroByteGas: '16',
});

export function validateCostModel(model: CostModel): void {
  if (!model || typeof model !== 'object') throw new Error('model must be an object');
  parseDecimalInteger(model.baseGas, 'model.baseGas');
  parseDecimalInteger(model.zeroByteGas, 'model.zeroByteGas');
  parseDecimalInteger(model.nonZeroByteGas, 'model.nonZeroByteGas');
}

/** Count zero and non-zero bytes in hex calldata (empty input is allowed). */
export function countDataBytes(data: unknown): { zero: number; nonZero: number } {
  const hex = normalizeData(data);
  if (hex === '') return { zero: 0, nonZero: 0 };
  let zero = 0;
  const bytes = hexToBytes(hex);
  for (const b of bytes) if (b === 0) zero += 1;
  return { zero, nonZero: bytes.length - zero };
}

/** Gas units for the given byte counts under `model`. */
export function estimateGas(counts: { zero: number; nonZero: number }, model: CostModel): bigint {
  validateCostModel(model);
  return (
    parseDecimalInteger(model.baseGas, 'model.baseGas') +
    BigInt(counts.zero) * parseDecimalInteger(model.zeroByteGas, 'model.zeroByteGas') +
    BigInt(counts.nonZero) * parseDecimalInteger(model.nonZeroByteGas, 'model.nonZeroByteGas')
  );
}
