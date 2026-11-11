import * as Secp256k1 from '../crypto/secp256k1.js';
import * as Shamir from '../sss/shamir.js';
import { measureNs, summarize } from './timing.js';
import type { BenchResult, ShamirBenchOptions, TimingStats } from './types.js';

const DEFAULT_ITERATIONS = 25;
const DEFAULT_WARMUP = 2;
const DEFAULT_THRESHOLD = 2;
const DEFAULT_TOTAL = 3;

function parseCount(value: number | undefined, fallback: number, name: string): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

function parsePositive(value: number | undefined, fallback: number, name: string): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function resolveSplit(opts?: ShamirBenchOptions): { threshold: number; total: number } {
  const threshold = parsePositive(opts?.threshold, DEFAULT_THRESHOLD, 'threshold');
  const total = parsePositive(opts?.total, DEFAULT_TOTAL, 'total');
  if (threshold < Shamir.MIN_THRESHOLD) {
    throw new Error(`threshold must be >= ${Shamir.MIN_THRESHOLD}`);
  }
  if (total < threshold) throw new Error('total must be >= threshold');
  if (total > Shamir.MAX_TOTAL_SHARES) {
    throw new Error(`total must be <= ${Shamir.MAX_TOTAL_SHARES}`);
  }
  return { threshold, total };
}

function timeLoop(iterations: number, warmup: number, body: () => void): TimingStats {
  for (let i = 0; i < warmup; i++) body();
  const samples: bigint[] = [];
  for (let i = 0; i < iterations; i++) {
    samples.push(measureNs(body));
  }
  return summarize(samples);
}

export function benchKeygen(opts?: ShamirBenchOptions): BenchResult {
  const iterations = parsePositive(opts?.iterations, DEFAULT_ITERATIONS, 'iterations');
  const warmup = parseCount(opts?.warmup, DEFAULT_WARMUP, 'warmup');
  const stats = timeLoop(iterations, warmup, () => {
    Secp256k1.generateKeyPair();
  });
  return { op: 'keygen', iterations, stats };
}

export function benchSplit(opts?: ShamirBenchOptions): BenchResult {
  const iterations = parsePositive(opts?.iterations, DEFAULT_ITERATIONS, 'iterations');
  const warmup = parseCount(opts?.warmup, DEFAULT_WARMUP, 'warmup');
  const { threshold, total } = resolveSplit(opts);
  const secret = Secp256k1.generatePrivateKey();
  const stats = timeLoop(iterations, warmup, () => {
    Shamir.splitSecret(secret, threshold, total);
  });
  return { op: 'split', threshold, total, iterations, stats };
}

export function benchCombine(opts?: ShamirBenchOptions): BenchResult {
  const iterations = parsePositive(opts?.iterations, DEFAULT_ITERATIONS, 'iterations');
  const warmup = parseCount(opts?.warmup, DEFAULT_WARMUP, 'warmup');
  const { threshold, total } = resolveSplit(opts);
  const secret = Secp256k1.generatePrivateKey();
  const shares = Shamir.splitSecret(secret, threshold, total);
  const subset = shares.slice(0, threshold);

  let last: Uint8Array | undefined;
  const stats = timeLoop(iterations, warmup, () => {
    last = Shamir.combineShares(subset);
  });
  if (!last || Buffer.compare(Buffer.from(last), Buffer.from(secret)) !== 0) {
    throw new Error('combine bench reconstructed a different secret');
  }
  return { op: 'combine', threshold, total, iterations, stats };
}

/**
 * Time keygen, split, and combine under the same k-of-n and iteration count.
 */
export function runShamirBench(opts?: ShamirBenchOptions): BenchResult[] {
  resolveSplit(opts);
  parsePositive(opts?.iterations, DEFAULT_ITERATIONS, 'iterations');
  parseCount(opts?.warmup, DEFAULT_WARMUP, 'warmup');
  return [benchKeygen(opts), benchSplit(opts), benchCombine(opts)];
}
