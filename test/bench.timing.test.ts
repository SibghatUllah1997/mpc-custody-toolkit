import { describe, expect, it } from 'vitest';
import { Bench } from '../src';

describe('timing helpers', () => {
  it('summarizes a known sample list', () => {
    const stats = Bench.summarize([10, 40, 20, 30]);
    expect(stats.samples).toBe(4);
    expect(stats.minNs).toBe(10);
    expect(stats.maxNs).toBe(40);
    expect(stats.meanNs).toBe(25);
    expect(stats.medianNs).toBe(25);
  });

  it('uses the middle value for an odd-length list', () => {
    expect(Bench.summarize([3, 1, 9]).medianNs).toBe(3);
    expect(Bench.summarize([7n, 1n, 4n, 8n, 2n]).meanNs).toBe(4);
  });

  it('measures a no-op as a non-negative duration', () => {
    const ns = Bench.measureNs(() => undefined);
    expect(ns >= 0n).toBe(true);
    expect(typeof Bench.nowNs()).toBe('bigint');
  });

  it('rejects an empty or negative sample list', () => {
    expect(() => Bench.summarize([])).toThrow(/need at least one sample/);
    expect(() => Bench.summarize([-1])).toThrow(/non-negative finite number/);
  });
});
