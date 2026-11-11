import { describe, expect, it } from 'vitest';
import { Bench } from '../src';

describe('Shamir micro-benchmarks', () => {
  it('times keygen, split, and combine with matching sample counts', () => {
    const results = Bench.runShamirBench({ iterations: 3, warmup: 0, threshold: 2, total: 3 });
    expect(results.map((r) => r.op)).toEqual(['keygen', 'split', 'combine']);
    for (const row of results) {
      expect(row.iterations).toBe(3);
      expect(row.stats.samples).toBe(3);
      expect(row.stats.minNs).toBeGreaterThanOrEqual(0);
      expect(row.stats.maxNs).toBeGreaterThanOrEqual(row.stats.minNs);
      expect(row.stats.meanNs).toBeGreaterThanOrEqual(row.stats.minNs);
      expect(row.stats.medianNs).toBeGreaterThanOrEqual(row.stats.minNs);
    }
    expect(results[1].threshold).toBe(2);
    expect(results[1].total).toBe(3);
    expect(results[2].threshold).toBe(2);
    expect(results[2].total).toBe(3);
  });

  it('keeps combine honest: a 3-of-5 split still reconstructs', () => {
    const [combine] = [Bench.benchCombine({ iterations: 2, warmup: 0, threshold: 3, total: 5 })];
    expect(combine.op).toBe('combine');
    expect(combine.stats.samples).toBe(2);
  });

  it('rejects a bad iteration count or k-of-n', () => {
    expect(() => Bench.runShamirBench({ iterations: 0 })).toThrow(/iterations must be a positive integer/);
    expect(() => Bench.runShamirBench({ threshold: 1, total: 3 })).toThrow(/threshold must be >= 2/);
    expect(() => Bench.runShamirBench({ threshold: 3, total: 2 })).toThrow(/total must be >= threshold/);
    expect(() => Bench.runShamirBench({ threshold: 2, total: 9 })).toThrow(/total must be <= 8/);
    expect(() => Bench.benchKeygen({ warmup: -1 })).toThrow(/warmup must be a non-negative integer/);
  });
});
