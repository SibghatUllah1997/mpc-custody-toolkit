import { describe, expect, it } from 'vitest';
import { Bench } from '../src';
import type { BenchResult } from '../src/bench';

const sample: BenchResult[] = [
  {
    op: 'keygen',
    iterations: 10,
    stats: { samples: 10, minNs: 800, maxNs: 2500, meanNs: 1200, medianNs: 1100 },
  },
  {
    op: 'split',
    threshold: 2,
    total: 3,
    iterations: 10,
    stats: { samples: 10, minNs: 40_000, maxNs: 90_000, meanNs: 55_000, medianNs: 52_000 },
  },
];

describe('bench formatters', () => {
  it('picks units by magnitude', () => {
    expect(Bench.formatNs(12)).toBe('12 ns');
    expect(Bench.formatNs(1500)).toBe('1.5 µs');
    expect(Bench.formatNs(2_500_000)).toBe('2.50 ms');
    expect(Bench.formatNs(1_250_000_000)).toBe('1.25 s');
  });

  it('renders k-of-n and a human table', () => {
    expect(Bench.formatKofN({ threshold: 2, total: 3 })).toBe('2-of-3');
    expect(Bench.formatKofN({})).toBe('—');
    const table = Bench.formatBenchTable(sample);
    expect(table).toMatch(/op\s+k-of-n/);
    expect(table).toMatch(/keygen/);
    expect(table).toMatch(/split/);
    expect(table).toMatch(/2-of-3/);
    expect(table).toMatch(/1\.1 µs/);
    expect(table).toMatch(/52\.0 µs/);
  });

  it('renders a markdown table for docs', () => {
    const md = Bench.formatBenchMarkdown(sample);
    expect(md).toContain('| op | k-of-n | iterations | median | mean | min | max |');
    expect(md).toContain('| keygen | — | 10 |');
    expect(md).toContain('| split | 2-of-3 | 10 |');
  });

  it('rejects empty result lists and negative durations', () => {
    expect(() => Bench.formatBenchTable([])).toThrow(/need at least one bench result/);
    expect(() => Bench.formatBenchMarkdown([])).toThrow(/need at least one bench result/);
    expect(() => Bench.formatNs(-1)).toThrow(/non-negative finite number/);
  });
});
