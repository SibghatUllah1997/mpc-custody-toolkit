import { describe, expect, it } from 'vitest';
import { Errors } from '../src';
import { INPUT_ERROR_CODES, InputError, isInputError, isInputErrorCode } from '../src/errors';

describe('InputError', () => {
  it('stores a code, message, and optional field', () => {
    const err = new InputError('invalid-hex', 'Invalid hex: contains non-hex characters', 'hex');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('InputError');
    expect(err.code).toBe('invalid-hex');
    expect(err.message).toBe('Invalid hex: contains non-hex characters');
    expect(err.field).toBe('hex');
    expect(isInputError(err)).toBe(true);
  });

  it('omits field when the caller does not pass one', () => {
    const err = new InputError('too-few', 'need at least 2 shares');
    expect(err.field).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(err, 'field')).toBe(false);
  });

  it('rejects an unknown code, empty message, or empty field', () => {
    expect(() => new InputError('not-a-code' as Errors.InputErrorCode, 'x')).toThrow(/unknown InputError code/);
    expect(() => new InputError('invalid-type', '')).toThrow(/message is required/);
    expect(() => new InputError('invalid-type', 'x', '')).toThrow(/field must be a non-empty string/);
  });
});

describe('InputError codes', () => {
  it('lists a stable set of codes and type-guards them', () => {
    expect(INPUT_ERROR_CODES).toContain('missing-value');
    expect(INPUT_ERROR_CODES).toContain('duplicate');
    expect(INPUT_ERROR_CODES).toContain('weak-passphrase');
    expect(new Set(INPUT_ERROR_CODES).size).toBe(INPUT_ERROR_CODES.length);
    expect(isInputErrorCode('invalid-json')).toBe(true);
    expect(isInputErrorCode('newer-version')).toBe(false);
    expect(isInputErrorCode(1)).toBe(false);
    expect(isInputError(new Error('plain'))).toBe(false);
  });
});
