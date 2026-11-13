# Foundation roundtrip

The first thing this toolkit has to get right is a secp256k1 private key that can be split and put back together. `Foundation.runFoundationRoundtrip()` does that in one call: generate (or accept) a scalar, split it k-of-n, combine a subset of shares, and compare both the recovered scalar and the compressed public key to the originals.

`match` is true only when both comparisons succeed. The CLI command `check` prints the public fields only, so a reconstructed scalar never lands on stdout.

## Defaults

- Threshold `k = 2`, total `n = 3`.
- Combined share indexes `1..k` unless `shareXs` is set.
- `n` is still capped at 8, same as `Shamir.splitSecret`.

## CLI

```bash
npm run build
npx mpc-toolkit check --threshold 2 --total 3
npx mpc-toolkit check --threshold 3 --total 5 --json
```

A failing roundtrip exits non-zero. Passing `--json` returns `{ ok, threshold, total, usedShareXs, publicKey, recoveredPublicKey }`.

## API

```ts
import { Foundation } from 'mpc-custody-toolkit';

const result = Foundation.assertFoundationRoundtrip({ threshold: 3, total: 5, shareXs: [1, 3, 5] });
const report = Foundation.publicFoundationReport(result);
```

`assertFoundationRoundtrip` throws if `match` is false. Pass `secret` to check a known 32-byte scalar instead of generating a fresh one.
