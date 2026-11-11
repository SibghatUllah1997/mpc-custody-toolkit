import type { BenchResult } from './types.js';

const MICRO = 1_000;
const MILLI = 1_000_000;
const SECOND = 1_000_000_000;

/** Compact duration for tables. Values are whole nanoseconds. */
export function formatNs(ns: number): string {
  if (!Number.isFinite(ns) || ns < 0) throw new Error('ns must be a non-negative finite number');
  if (ns >= SECOND) return `${(ns / SECOND).toFixed(2)} s`;
  if (ns >= MILLI) return `${(ns / MILLI).toFixed(2)} ms`;
  if (ns >= MICRO) return `${(ns / MICRO).toFixed(1)} µs`;
  return `${Math.round(ns)} ns`;
}

export function formatKofN(result: Pick<BenchResult, 'threshold' | 'total'>): string {
  if (result.threshold === undefined || result.total === undefined) return '—';
  return `${result.threshold}-of-${result.total}`;
}

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

/** Fixed-width human table for CLI output. */
export function formatBenchTable(results: BenchResult[]): string {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('need at least one bench result');
  }
  const header = [
    pad('op', 10),
    pad('k-of-n', 8),
    pad('n', 6),
    pad('median', 12),
    pad('mean', 12),
    pad('min', 12),
    pad('max', 12),
  ].join(' ');
  const rows = results.map((r) =>
    [
      pad(r.op, 10),
      pad(formatKofN(r), 8),
      pad(String(r.iterations), 6),
      pad(formatNs(r.stats.medianNs), 12),
      pad(formatNs(r.stats.meanNs), 12),
      pad(formatNs(r.stats.minNs), 12),
      pad(formatNs(r.stats.maxNs), 12),
    ].join(' ')
  );
  return [header, ...rows].join('\n');
}

/** Markdown table suitable for docs. */
export function formatBenchMarkdown(results: BenchResult[]): string {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('need at least one bench result');
  }
  const lines = [
    '| op | k-of-n | iterations | median | mean | min | max |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    lines.push(
      `| ${r.op} | ${formatKofN(r)} | ${r.iterations} | ${formatNs(r.stats.medianNs)} | ${formatNs(r.stats.meanNs)} | ${formatNs(r.stats.minNs)} | ${formatNs(r.stats.maxNs)} |`
    );
  }
  return lines.join('\n');
}
