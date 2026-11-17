/**
 * Coded failure for bad caller input (hex, integers, missing flags, JSON).
 * Distinct from SchemaError, which is about persisted file versions.
 */

export const INPUT_ERROR_CODES = [
  'invalid-type',
  'invalid-hex',
  'invalid-length',
  'invalid-integer',
  'invalid-json',
  'invalid-range',
  'missing-value',
  'duplicate',
  'too-few',
  'weak-passphrase',
  'mismatch',
] as const;

export type InputErrorCode = (typeof INPUT_ERROR_CODES)[number];

export function isInputErrorCode(value: unknown): value is InputErrorCode {
  return typeof value === 'string' && (INPUT_ERROR_CODES as readonly string[]).includes(value);
}

/** Raised when an argument, flag, or field cannot be used as given. */
export class InputError extends Error {
  readonly code: InputErrorCode;
  /** Flag or dotted path, e.g. `--threshold` or `shares[0].y`. */
  readonly field?: string;

  constructor(code: InputErrorCode, message: string, field?: string) {
    if (!isInputErrorCode(code)) {
      throw new Error(`unknown InputError code: ${String(code)}`);
    }
    if (typeof message !== 'string' || message.length === 0) {
      throw new Error('InputError message is required');
    }
    if (field !== undefined && (typeof field !== 'string' || field.length === 0)) {
      throw new Error('InputError field must be a non-empty string when set');
    }
    super(message);
    this.name = 'InputError';
    this.code = code;
    if (field !== undefined) this.field = field;
  }
}

export function isInputError(err: unknown): err is InputError {
  return err instanceof InputError;
}
