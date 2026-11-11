import { describe, expect, it } from 'vitest';
import { parseArgs, parseBenchArgs, runBench } from '../src/cli';
import { explainError } from '../src/ux/errors';

describe('CLI bench', () => {
  it('parses iterations, k-of-n, and warmup flags', () => {
    const args = parseArgs(['bench', '--iterations', '4', '--threshold', '3', '--total', '5', '--warmup', '0']);
    expect(parseBenchArgs(args)).toEqual({
      iterations: 4,
      warmup: 0,
      threshold: 3,
      total: 5,
    });
  });

  it('accepts short -i / -t / -n aliases', () => {
    expect(parseBenchArgs(parseArgs(['bench', '-i', '2', '-t', '2', '-n', '4']))).toEqual({
      iterations: 2,
      warmup: undefined,
      threshold: 2,
      total: 4,
    });
  });

  it('runs a tiny bench through the CLI helper', () => {
    const results = runBench({ iterations: 2, warmup: 0, threshold: 2, total: 3 });
    expect(results.map((r) => r.op)).toEqual(['keygen', 'split', 'combine']);
    expect(results.every((r) => r.stats.samples === 2)).toBe(true);
  });

  it('rejects a non-integer --iterations flag', () => {
    expect(() => parseBenchArgs(parseArgs(['bench', '--iterations', 'nope']))).toThrow(
      /--iterations must be an integer/
    );
  });

  it('hints when iterations is out of range', () => {
    const explained = explainError(new Error('iterations must be a positive integer'));
    expect(explained.hint).toMatch(/--iterations/);
  });
});
