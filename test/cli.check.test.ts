import { describe, expect, it } from 'vitest';
import { parseArgs, parseCheckArgs, runCheck } from '../src/cli';
import { InputError } from '../src/errors';

function expectCode(fn: () => unknown, code: InputError['code'], pattern: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).message).toMatch(pattern);
  }
}

describe('CLI check', () => {
  it('parses k-of-n flags and aliases', () => {
    expect(parseCheckArgs(parseArgs(['check', '--threshold', '3', '--total', '5']))).toEqual({
      threshold: 3,
      total: 5,
    });
    expect(parseCheckArgs(parseArgs(['check', '-t', '2', '-n', '4']))).toEqual({
      threshold: 2,
      total: 4,
    });
    expect(parseCheckArgs(parseArgs(['check']))).toEqual({
      threshold: undefined,
      total: undefined,
    });
  });

  it('runs a 2-of-3 roundtrip and reports only public fields', () => {
    const out = runCheck({ threshold: 2, total: 3 });
    expect(out.ok).toBe(true);
    expect(out.threshold).toBe(2);
    expect(out.total).toBe(3);
    expect(out.usedShareXs).toEqual([1, 2]);
    expect(out.publicKey).toBe(out.recoveredPublicKey);
    expect(out.publicKey).toMatch(/^[0-9a-f]{66}$/);
    expect(Object.keys(out).sort()).toEqual([
      'ok',
      'publicKey',
      'recoveredPublicKey',
      'threshold',
      'total',
      'usedShareXs',
    ]);
  });

  it('rejects a total below the threshold', () => {
    expectCode(() => runCheck({ threshold: 3, total: 2 }), 'invalid-range', /total must be an integer >= threshold/);
  });
});
