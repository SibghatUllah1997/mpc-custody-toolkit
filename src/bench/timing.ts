import type { TimingStats } from './types.js';

export function nowNs(): bigint {
  return process.hrtime.bigint();
}

/** Wall time of a synchronous `fn` in nanoseconds. */
export function measureNs(fn: () => void): bigint {
  const t0 = nowNs();
  fn();
  return nowNs() - t0;
}

export function summarize(samplesNs: Array<bigint | number>): TimingStats {
  if (!Array.isArray(samplesNs) || samplesNs.length === 0) {
    throw new Error('need at least one sample');
  }
  const nums = samplesNs.map((n) => {
    const v = typeof n === 'bigint' ? Number(n) : n;
    if (!Number.isFinite(v) || v < 0) throw new Error('sample must be a non-negative finite number');
    return v;
  });
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((acc, n) => acc + n, 0);
  const mid = Math.floor(nums.length / 2);
  const median =
    nums.length % 2 === 1 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
  return {
    samples: nums.length,
    minNs: nums[0],
    maxNs: nums[nums.length - 1],
    meanNs: Math.round(sum / nums.length),
    medianNs: median,
  };
}
