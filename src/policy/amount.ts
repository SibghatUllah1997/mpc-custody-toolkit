/**
 * Decimal integer amounts used in spend limits and sign requests.
 * Accepts only canonical strings: "0" or a digit 1-9 followed by up to 77 more digits.
 */

import { InputError } from '../errors/input.js';

const DECIMAL_INTEGER = /^(0|[1-9][0-9]{0,77})$/;

export function isDecimalIntegerString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_INTEGER.test(value);
}

export function parseDecimalInteger(value: string, name: string): bigint {
  if (!isDecimalIntegerString(value)) {
    throw new InputError('invalid-integer', `${name} must be a non-negative decimal integer string`, name);
  }
  return BigInt(value);
}

export function compareDecimalInteger(a: string, b: string): number {
  const left = parseDecimalInteger(a, 'left');
  const right = parseDecimalInteger(b, 'right');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Canonical decimal string of `a + b`. Both must already be canonical. */
export function addDecimalInteger(a: string, b: string): string {
  return (parseDecimalInteger(a, 'left') + parseDecimalInteger(b, 'right')).toString();
}
