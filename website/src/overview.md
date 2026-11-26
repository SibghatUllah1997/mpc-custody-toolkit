# MPC / Custody Wallet Toolkit

[![CI](https://github.com/SibghatUllah1997/mpc-custody-toolkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SibghatUllah1997/mpc-custody-toolkit/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue)

TypeScript toolkit for threshold key management and custody workflows: secp256k1 and BIP-39/BIP-32 key generation, Shamir (t, n) splitting with Argon2id-encrypted shares, share rotation, signing policies with rate limits, EIP-191/EIP-712 signing prompts and an air-gapped signing flow.

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
npx mpc-toolkit keygen --new-mnemonic --words 24
npx mpc-toolkit keygen --mnemonic-file words.txt --path "m/44'/60'/0'/0/1" --json
npx mpc-toolkit split --secret 0x<64-hex> --threshold 2 --total 3 --commitments c.json
npx mpc-toolkit verify-share --commitments c.json --file s1.json --json
npx mpc-toolkit combine --shares '[{\"x\":1,\"y\":\"<hex>\"},{\"x\":2,\"y\":\"<hex>\"}]'
npx mpc-toolkit threshold-setup --threshold 2 --total 3
npx mpc-toolkit prompt --from aa11 --to bb22 --value 250
npx mpc-toolkit export-shares --shares '[{\"x\":1,\"y\":\"<hex>\"},{\"x\":2,\"y\":\"<hex>\"}]' --out vault.ndjson
npx mpc-toolkit combine --stream vault.ndjson
npx mpc-toolkit bench --iterations 50 --json
npx mpc-toolkit check --threshold 2 --total 3
npx mpc-toolkit recover-dry-run --files s1.json,s2.json --json
npx mpc-toolkit rotate-shares --files s1.json,s2.json --threshold 3 --total 5 --out-dir next/ --json
npx mpc-toolkit audit-append --file decisions.jsonl --kind policy-decision --outcome deny --codes limit-exceeded --json
npx mpc-toolkit audit-read --file decisions.jsonl --json
npx mpc-toolkit spend-record --file spends.jsonl --asset ETH --value 40 --json
npx mpc-toolkit spend-check --policy vault.json --asset ETH --value 20 --file spends.jsonl --json
npx mpc-toolkit hash-message --text 'Hello World' --json
npx mpc-toolkit address --pubkey <hex> --json
npx mpc-toolkit addresses --xpub <xpub> --chain 0 --count 5 --json
npx mpc-toolkit doctor --shares s1.json,s2.json --audit decisions.jsonl --spent-log spent.jsonl --queue queue.json --json
npx mpc-toolkit prompt --text 'Hello World'
npx mpc-toolkit airgap-request --pubkey <hex> --from aa11 --to bb22 --value 250 --ttl 1h --out req.json
npx mpc-toolkit airgap-sign --request req.json --key-file signer.key --out res.json --spent-log spent.jsonl --policy-snapshot snap.json --policy-pubkey <hex>
npx mpc-toolkit airgap-verify --request req.json --response res.json
npx mpc-toolkit queue-create --file queue.json --threshold 2 --approvers alice:<hex>,bob:<hex> --tx '<json>' --ttl 1h --delay 15m
npx mpc-toolkit queue-receipt --file queue.json --signer alice --key-file alice.key
npx mpc-toolkit queue-status --file queue.json --json
npx mpc-toolkit policy-export --policy vault.json --key-file policy.key --out snap.json --ttl 1h
npx mpc-toolkit policy-verify --snapshot snap.json --pubkey <hex> --json
```

Notes:
- Human-readable output is the default; pass `--json` for machine output. `--log-level debug` writes extra traces to stderr.
- Splits are k-of-n with n at most 8 and unique share indexes.
- Share files carry a checksum plus an HMAC-SHA256 integrity MAC; optional password encryption uses Argon2id (19 MiB, 2 passes) and AES-256-GCM. Older scrypt files still decrypt.
- Encrypted export requires a strong passphrase and a matching confirmation. `recover-dry-run` validates backups and threshold without printing the reconstructed secret.
- `rotate-shares` re-splits the same key into a fresh (k, n) set with a new set id, verifies the new files, then renames the old ones to `*.retired`.
- The library APIs in `src/` are the source of truth; the CLI is a thin wrapper.

## What’s here today
- secp256k1 key generation using audited `@noble/curves`
- Shamir secret sharing over the secp256k1 scalar field (k-of-n, n ≤ 8, unique x), with optional Feldman commitments so one share can be checked without combining
- A foundation roundtrip check (`mpc-toolkit check`) that keygen, split, and combine still agree
- A local policy engine: signers, thresholds, per-asset limits and destination lists, optional rolling spend windows, and an in-memory JSON store
- A local JSONL spend ledger (`spend-record` / `spend-check`) used by those rolling windows
- An append-only JSONL audit log of policy decisions and pre-sign outcomes (`mpc-toolkit audit-append` / `audit-read`)
- Frozen Shamir reconstruction vectors and a chain-agnostic transaction object (`from`, `to`, `value`, `data`)
- A pure transaction simulator (mock gas/fee estimate plus spend-limit check), see `docs/SIMULATION.md`
- A pre-sign pipeline that combines transaction validation, an optional k-of-n receipt queue, policy, and optional simulation
- A local pending-approval queue of signed receipts (`queue-create` / `queue-receipt` / `queue-status`), with an optional delay after k receipts before pre-sign
- A signed policy snapshot (`policy-export` / `policy-verify`) the offline machine can check before air-gap signing
- Single-party ECDSA (compact low-S) over a 32-byte digest, including helpers to sign and verify a transaction
- A toy 2-of-3 threshold demo: Shamir combine offline, then a single-party signature (see `docs/THRESHOLD.md`)
- An air-gap signing flow: export an unsigned request file (optional `--ttl` / `--expires`), sign it on an offline machine, verify the returned signature, and optionally record the id in a spent-request log (see `docs/AIRGAP.md`)
- Human-readable signing prompts (including EIP-55 addresses from compressed public keys), CLI colors/hints/`--json`, and leveled logs
- EIP-191 personal_sign and EIP-712 typed-data hashing (`hash-message`, `hash-typed`) with the digest shown in `prompt`
- Optional BIP-39 mnemonic / BIP-32 HD keygen (`Hd`, via `@scure/bip39` and `@scure/bip32`); mnemonics are read from files only
- Watch-only xpub address listing (`addresses --xpub`) for BIP-32 accounts without the secret
- `mpc-toolkit doctor` checks share backups, audit chains, spent-request logs, and approval queue files
- NDJSON stream helpers for large share backup import/export, plus a sample custody workflow (`docs/examples/custody-workflow.md`)
- A keygen/split/combine timer (`mpc-toolkit bench`) with recorded numbers in `docs/BENCHMARKS.md`
- An mdbook docs site in `website/`; each tagged release attaches the built site, and the Pages deploy turns on with the `PAGES_ENABLED` repo variable
- Typed ESM entry (`exports` + `.d.ts`) and generated API reference tables in `docs/API.md`
- Coded `InputError` checks with CLI hints for missing flags and bad share JSON
- Tests via `vitest`
- GitHub Actions CI on Node 20, 22, and 24, with an lcov coverage report

## Share backup format
A simple JSON format with a SHA-256 checksum and HMAC-SHA256 integrity MAC is provided for individual Shamir shares. See `docs/SHARE_FORMAT.md` for the schema and an example. Share and policy files are versioned; older files are upgraded on load (see `docs/SCHEMAS.md`).

## Policy engine
Local signers, thresholds, per-asset spend caps, and optional destination allow/deny lists live under `src/policy`. A process-memory store can be saved as versioned JSON. Decisions can be appended to a hash-chained JSONL audit log. See `docs/POLICY.md` for the rules and snapshot shape.

## Threat model and non‑goals
See `THREAT_MODEL.md` for the current v0.2 threat model, assumptions, and explicit non‑goals, and `docs/CEREMONY.md` for split, backup, approval, and air-gap runbooks. This toolkit is educational and not audited; do not use it to protect real funds.

## Releases
Tagged releases follow `v<package version>`. Pushing a tag runs `.github/workflows/release.yml`, which builds, tests, checks the tag against `package.json`, and publishes the matching section of `docs/RELEASE_NOTES.md` as the GitHub release, with the built docs site attached. `mpc-toolkit release-check` confirms the notes file is ready; `mpc-toolkit --version` prints the installed version.

## Roadmap
See `ROADMAP.md` for the 30‑day plan and Phase 2 / 3 work (complete through v0.2.0) and `docs/FOUNDATION.md` for the keygen/split/combine check.

## License
MIT — see `LICENSE`.

© HM Sibghat Ullah
