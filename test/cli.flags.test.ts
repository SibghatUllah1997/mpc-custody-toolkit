import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import {
  parseArgs,
  parseBenchArgs,
  parseShareIndexList,
  parseShareJson,
  parseShareSetArgs,
  parseTransactionJson,
  validateSplitArgs,
} from '../src/cli';
import { optionalFlagInt, optionalFlagString, parsePathList, requireFlagString } from '../src/ux/flags';

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

describe('CLI flag value helpers', () => {
  it('rejects a bare flag that needed a string or integer', () => {
    const args = parseArgs(['split', '--secret', '--threshold']);
    expectCode(() => optionalFlagString(args, 'secret'), 'missing-value', /--secret requires a value/);
    expectCode(() => optionalFlagInt(args, 'threshold'), 'missing-value', /--threshold requires an integer value/);
  });

  it('parses integers from strings and rejects junk', () => {
    expect(optionalFlagInt(parseArgs(['--threshold', '3']), 'threshold')).toBe(3);
    expect(optionalFlagInt(parseArgs(['-t', '4']), 'threshold', ['t'])).toBe(4);
    expect(optionalFlagInt(parseArgs([]), 'threshold')).toBeUndefined();
    expectCode(
      () => optionalFlagInt(parseArgs(['--iterations', 'nope']), 'iterations'),
      'invalid-integer',
      /--iterations must be an integer/
    );
    expectCode(
      () => optionalFlagInt(parseArgs(['--warmup', '1.5']), 'warmup'),
      'invalid-integer',
      /--warmup must be an integer/
    );
  });

  it('requires a named string flag and splits path lists', () => {
    expect(requireFlagString(parseArgs(['--file', 'a.json']), 'file')).toBe('a.json');
    expectCode(() => requireFlagString(parseArgs([]), 'file', { message: '--file <path> is required' }), 'missing-value', /--file <path> is required/);
    expect(parsePathList('a.json, b.json', { minCount: 2, flag: 'files' })).toEqual(['a.json', 'b.json']);
    expectCode(() => parsePathList('solo.json', { minCount: 2, flag: 'files' }), 'too-few', /need at least 2 files/);
    expectCode(() => parsePathList(', ,', { minCount: 1, flag: 'files' }), 'too-few', /need at least 1 files/);
  });
});

describe('parseShareJson extra checks', () => {
  const y = '11'.repeat(32);

  it('rejects an out-of-range x, a duplicate x, and a list item that is an array', () => {
    expectCode(
      () => parseShareJson(JSON.stringify([{ x: 9, y }, { x: 2, y }])),
      'invalid-range',
      /x must be an integer in 1\.\.8/
    );
    expectCode(
      () => parseShareJson(JSON.stringify([{ x: 1, y }, { x: 1, y: '22'.repeat(32) }])),
      'duplicate',
      /duplicate share x=1/
    );
    expectCode(
      () => parseShareJson(JSON.stringify([[1, y], { x: 2, y }])),
      'invalid-type',
      /--shares\[0\] must be an object/
    );
  });

  it('prefixes a short y with the field path', () => {
    expectCode(
      () => parseShareJson(JSON.stringify([{ x: 1, y: 'aa' }, { x: 2, y }])),
      'invalid-length',
      /--shares\[0\]\.y: Invalid hex length/
    );
  });
});

describe('parseShareIndexList extra checks', () => {
  it('rejects a duplicate index and a value above 8', () => {
    expect(parseShareIndexList('1,3')).toEqual([1, 3]);
    expectCode(() => parseShareIndexList('1,1'), 'duplicate', /duplicate index 1/);
    expectCode(() => parseShareIndexList('9'), 'invalid-range', /1\.\.8/);
  });
});

describe('parseTransactionJson extra checks', () => {
  it('rejects a JSON array where an object is required', () => {
    expectCode(() => parseTransactionJson('[]'), 'invalid-type', /--tx must be a JSON object/);
    expectCode(() => parseTransactionJson(''), 'invalid-json', /Invalid JSON for --tx/);
  });
});

describe('parseBenchArgs / parseShareSetArgs / validateSplitArgs', () => {
  it('does not treat a bare --iterations as 1', () => {
    expectCode(
      () => parseBenchArgs(parseArgs(['bench', '--iterations'])),
      'missing-value',
      /--iterations requires an integer value/
    );
  });

  it('rejects a bare --set-id instead of calling it 16 hex chars', () => {
    expectCode(
      () => parseShareSetArgs(parseArgs(['--set-id', '--threshold', '2', '--total', '3'])),
      'missing-value',
      /--set-id requires a value/
    );
  });

  it('still codes a total above 8 as invalid-range', () => {
    expectCode(() => validateSplitArgs(2, 9), 'invalid-range', /--total must be an integer <= 8/);
  });
});
