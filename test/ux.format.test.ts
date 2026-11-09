import { describe, expect, it } from 'vitest';
import { formatCliValue, formatHumanValue } from '../src/ux/format';
import { renderCliError } from '../src/ux/errors';

describe('formatHumanValue', () => {
  it('labels share rows from an array and from a nested shares field', () => {
    const shares = [
      { x: 1, y: 'aa' },
      { x: 2, y: 'bb' },
    ];
    expect(formatHumanValue(shares)).toBe('share 1      aa\nshare 2      bb');
    expect(formatHumanValue({ threshold: 2, shares })).toContain('threshold    2');
    expect(formatHumanValue({ threshold: 2, shares })).toContain('share 1      aa');
  });

  it('humanizes camelCase keys', () => {
    expect(formatHumanValue({ publicKey: '02ab' })).toBe('public key   02ab');
  });
});

describe('formatCliValue', () => {
  it('pretty-prints JSON when requested and human text otherwise', () => {
    const value = { secret: 'ff' };
    expect(formatCliValue(value, { json: true })).toBe(JSON.stringify(value, null, 2));
    expect(formatCliValue(value, { json: false, color: false })).toBe('secret       ff');
    expect(formatCliValue(value, { json: false, color: true })).toContain('\u001b[');
  });
});

describe('renderCliError', () => {
  it('colors a hint in human mode and emits JSON when asked', () => {
    const err = new Error('unknown command: frob');
    const human = renderCliError(err, { json: false, color: true });
    expect(human).toContain('\u001b[31m');
    expect(human).toContain('hint:');
    const json = JSON.parse(renderCliError(err, { json: true }));
    expect(json.ok).toBe(false);
    expect(json.error).toBe('unknown command: frob');
    expect(json.hint).toMatch(/--json/);
  });
});
