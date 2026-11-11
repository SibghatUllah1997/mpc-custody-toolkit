# MPC / Custody Wallet Toolkit

An educational, open-source toolkit for building threshold/MPC-style key management and custody workflows. Day 1 ships a tiny, working foundation: secp256k1 key generation plus Shamir (t, n) secret splitting and recombination of a private key.

Important: This project is for education and prototyping only. It has not been audited. Do not use it to secure real funds.

## Quickstart

Prerequisites:
- Node.js 20+
- npm 9+

Setup and test:
```bash
git clone https://github.com/SibghatUllah1997/mpc-custody-toolkit
cd mpc-custody-toolkit
npm install
npm test
```

### CLI (experimental)

After building, a minimal CLI is available:

```bash
npm run build
npx mpc-toolkit keygen
npx mpc-toolkit split --secret 0x<64-hex> --threshold 2 --total 3
npx mpc-toolkit combine --shares '[{\"x\":1,\"y\":\"<hex>\"},{\"x\":2,\"y\":\"<hex>\"}]'
npx mpc-toolkit threshold-setup --threshold 2 --total 3
npx mpc-toolkit prompt --from aa11 --to bb22 --value 250
npx mpc-toolkit export-shares --shares '[{\"x\":1,\"y\":\"<hex>\"},{\"x\":2,\"y\":\"<hex>\"}]' --out vault.ndjson
npx mpc-toolkit combine --stream vault.ndjson
npx mpc-toolkit bench --iterations 50 --json
```

Notes:
- Human-readable output is the default; pass `--json` for machine output. `--log-level debug` writes extra traces to stderr.
- Splits are k-of-n with n at most 8 and unique share indexes.
- Share files carry a checksum plus an HMAC-SHA256 integrity MAC; optional password encryption is supported.
- The library APIs in `src/` are the source of truth; the CLI is a thin wrapper.

## What’s here today
- secp256k1 key generation using audited `@noble/curves`
- Shamir secret sharing over the secp256k1 scalar field (k-of-n, n ≤ 8, unique x)
- A local policy engine: signers, thresholds, per-asset limits, and an in-memory JSON store
- Frozen Shamir reconstruction vectors and a chain-agnostic transaction object (`from`, `to`, `value`, `data`)
- A pure transaction simulator (mock gas/fee estimate plus spend-limit check), see `docs/SIMULATION.md`
- A pre-sign pipeline that combines transaction validation, policy, and optional simulation
- Single-party ECDSA (compact low-S) over a 32-byte digest, including helpers to sign and verify a transaction
- A toy 2-of-3 threshold demo: Shamir combine offline, then a single-party signature (see `docs/THRESHOLD.md`)
- Human-readable signing prompts, CLI colors/hints/`--json`, and leveled logs
- NDJSON stream helpers for large share backup import/export, plus a sample custody workflow (`docs/examples/custody-workflow.md`)
- A keygen/split/combine timer (`mpc-toolkit bench`) with recorded numbers in `docs/BENCHMARKS.md`
- Tests via `vitest`
- GitHub Actions CI to run tests on PRs

## Share backup format
A simple JSON format with a SHA-256 checksum and HMAC-SHA256 integrity MAC is provided for individual Shamir shares. See `docs/SHARE_FORMAT.md` for the schema and an example. Share and policy files are versioned; older files are upgraded on load (see `docs/SCHEMAS.md`).

## Policy engine
Local signers, thresholds, and per-asset spend caps live under `src/policy`. A process-memory store can be saved as versioned JSON. See `docs/POLICY.md` for the rules and snapshot shape.

## Threat model and non‑goals
See `THREAT_MODEL.md` for the current v0 threat model, assumptions, and explicit non‑goals. This toolkit is educational and not audited; do not use it to protect real funds.

## Roadmap
See `ROADMAP.md` for a focused 30‑day plan: threshold signing demo, key‑share backup and recovery, policy engine, transaction simulation, and more tests/docs.

## License
MIT — see `LICENSE`.

© HM Sibghat Ullah
