export type BenchOp = 'keygen' | 'split' | 'combine';

export type TimingStats = {
  samples: number;
  minNs: number;
  maxNs: number;
  meanNs: number;
  medianNs: number;
};

export type BenchResult = {
  op: BenchOp;
  /** k-of-n used for split/combine; omitted for keygen. */
  threshold?: number;
  total?: number;
  iterations: number;
  stats: TimingStats;
};

export type ShamirBenchOptions = {
  iterations?: number;
  warmup?: number;
  threshold?: number;
  total?: number;
};
