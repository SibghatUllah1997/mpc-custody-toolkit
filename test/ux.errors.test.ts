import { describe, expect, it } from 'vitest';
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
