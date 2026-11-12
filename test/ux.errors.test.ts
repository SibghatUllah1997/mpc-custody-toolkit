import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import { SchemaError } from '../src/schema';
import { explainError, formatErrorLines } from '../src/ux/errors';
import { wantsJson } from '../src/ux/output';

describe('explainError', () => {
  it('attaches a hint for known CLI failures', () => {
    const explained = explainError(new Error('Invalid JSON for --shares'));
    expect(explained.hint).toMatch(/JSON array/);
  });

  it('leaves unknown errors without a hint', () => {
    expect(explainError(new Error('something novel')).hint).toBeUndefined();
    expect(explainError('bare string').message).toBe('bare string');
  });

  it('falls back to an InputError code hint when no regex matches', () => {
    const err = new InputError('missing-value', 'custom missing thing', 'secret');
    const explained = explainError(err);
    expect(explained.code).toBe('missing-value');
    expect(explained.field).toBe('secret');
    expect(explained.hint).toMatch(/Pass a value after the flag/);
  });

  it('keeps a specific regex hint over the generic code hint', () => {
    const err = new InputError('invalid-hex', 'Invalid hex: contains non-hex characters', 'hex');
    expect(explainError(err).hint).toMatch(/0x/);
  });

  it('hints a bare flag that needed an integer', () => {
    const err = new InputError('missing-value', '--iterations requires an integer value', 'iterations');
    expect(explainError(err).hint).toMatch(/whole number/);
  });
});

describe('formatErrorLines', () => {
  it('prints error and hint as two lines, or a JSON object', () => {
    const err = new Error('need at least 2 files');
    expect(formatErrorLines(err)).toBe(
      'error: need at least 2 files\nhint: Pass two or more comma-separated paths to --files.'
    );
    const json = JSON.parse(formatErrorLines(err, { json: true }));
    expect(json.ok).toBe(false);
    expect(json.error).toBe('need at least 2 files');
    expect(json.hint).toMatch(/comma-separated/);
    expect(json.code).toBeNull();
    expect(json.field).toBeNull();
  });

  it('includes InputError and SchemaError codes in JSON', () => {
    const input = new InputError('duplicate', '--shares: duplicate share x=1', 'shares');
    const json = JSON.parse(formatErrorLines(input, { json: true }));
    expect(json.code).toBe('duplicate');
    expect(json.field).toBe('shares');
    expect(json.hint).toMatch(/unique share index/);
    const schema = new SchemaError('newer-version', 'file is from a newer toolkit');
    const schemaJson = JSON.parse(formatErrorLines(schema, { json: true }));
    expect(schemaJson.code).toBe('newer-version');
    expect(schemaJson.field).toBeNull();
  });
});

describe('wantsJson', () => {
  it('treats --json as a boolean flag or a true/1 string', () => {
    expect(wantsJson({ json: true })).toBe(true);
    expect(wantsJson({ json: 'true' })).toBe(true);
    expect(wantsJson({ json: '1' })).toBe(true);
    expect(wantsJson({ json: 'false' })).toBe(false);
    expect(wantsJson({})).toBe(false);
  });
});
