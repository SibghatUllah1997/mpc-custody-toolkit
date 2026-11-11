# Shamir timings

`Bench.runShamirBench()` times secp256k1 keygen, a k-of-n split, and a threshold combine on the local process. Numbers below are a snapshot, not a guarantee: they move with CPU, load, and Node version.

Recorded 2026-11-11 on Node.js 22, 50 timed iterations, 5 warmup runs.

## 2-of-3

| op | k-of-n | iterations | median | mean | min | max |
| --- | --- | --- | --- | --- | --- | --- |
| keygen | — | 50 | 263.2 µs | 298.7 µs | 218.6 µs | 1.19 ms |
| split | 2-of-3 | 50 | 13.6 µs | 14.6 µs | 13.1 µs | 42.9 µs |
| combine | 2-of-3 | 50 | 9.8 µs | 10.2 µs | 9.6 µs | 21.8 µs |

## 3-of-5

| op | k-of-n | iterations | median | mean | min | max |
| --- | --- | --- | --- | --- | --- | --- |
| keygen | — | 50 | 265.6 µs | 302.5 µs | 214.3 µs | 1.45 ms |
| split | 3-of-5 | 50 | 23.8 µs | 25.3 µs | 22.8 µs | 60.8 µs |
| combine | 3-of-5 | 50 | 19.2 µs | 20.2 µs | 16.7 µs | 32.9 µs |

## 8-of-8

| op | k-of-n | iterations | median | mean | min | max |
| --- | --- | --- | --- | --- | --- | --- |
| keygen | — | 50 | 265.9 µs | 297.7 µs | 223.6 µs | 1.22 ms |
| split | 8-of-8 | 50 | 58.7 µs | 73.0 µs | 44.6 µs | 527.2 µs |
| combine | 8-of-8 | 50 | 92.2 µs | 99.2 µs | 61.9 µs | 380.1 µs |

Keygen dominates because it samples a scalar and computes a compressed public key. Split and combine stay in the tens of microseconds at this k-of-n cap (n ≤ 8). Combine on 8-of-8 is slower than 2-of-3 because Lagrange interpolation is quadratic in the number of shares.

## Reproduce

```bash
npm run build
npx mpc-toolkit bench --iterations 50 --threshold 2 --total 3
npx mpc-toolkit bench --iterations 50 --threshold 3 --total 5 --json
```

Or from the library:

```ts
import { Bench } from 'mpc-custody-toolkit';

const rows = Bench.runShamirBench({ iterations: 50, threshold: 2, total: 3 });
console.log(Bench.formatBenchMarkdown(rows));
```
