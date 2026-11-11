## 2026-11-11

- Added seeded property-based fuzz tests (`fast-check`) for `combineShares` covering duplicate x, malformed x/y, junk entries, too-few shares, and corrupted backup files.
- Fuzzing found two gaps, now fixed: combine accepted a share `y` at or above the curve order (silently reducing it to a wrong key) and threw a raw `TypeError` on `null` entries.
- Roadmap item for combine fuzz tests is marked done.

## 2026-11-10

- Share backups can be streamed as NDJSON for large import/export (`export-shares`, `import-shares`, `combine --stream`, `threshold-sign --stream`).
- An end-to-end custody workflow example covers keygen, split, policy, pre-sign, and threshold signing (`docs/examples/custody-workflow.md`).
- Roadmap items for the stream helpers and the sample workflow are marked done.

- Added `src/schema`: a shared `{ type, version }` header check, step-by-step migrations, and `SchemaError` codes (including `newer-version`).
- Share backups now write v2: the MAC is required, and an optional `data.set` (split id, threshold, total) lets combine reject shares from different splits or too few files. v1 files still load.
- Policy store snapshots now write v2 with a SHA-256 digest over the policies; v1 snapshots are upgraded on load.

## 2026-11-09

- Added a 2-of-3 offline threshold signing demo (reconstruct, then ECDSA) plus CLI `threshold-setup` / `threshold-sign`.
- Signing prompts spell out the transfer or digest being approved; the CLI gained colors, hints, `--json`, and leveled logs (error/warn/info/debug).
- Roadmap items for the threshold demo, signing prompts, CLI UX, and logging are marked done.

## Day 1 — Foundation

- Set up a clean TypeScript + Node + Vitest project.
- Added secp256k1 key generation and Shamir (t, n) split/combine for private keys, with tests and CI. 

## 2026-10-31

- Added hex/bytes utilities with strict validation and hardened input checks across modules.
- Introduced a minimal `mpc-toolkit` CLI with `keygen`, `split`, and `combine` commands.
- Updated the roadmap to tick off the next items and documented basic CLI usage.

## 2026-11-01

- Added v0 threat model and non‑goals; implemented share backup JSON (v1) with SHA‑256 checksum plus encode/decode APIs and tests.
- Documented the share format and introduced stable JSON stringify to make checksums deterministic.

## 2026-11-02

- Added CLI share file import/export with validation based on the v1 JSON+checksum format.
- Introduced optional password-based encryption at rest for shares (scrypt + AES‑256‑GCM) and integrated it into the CLI.
- Enabled `combine --files` to reconstruct secrets directly from (plain or encrypted) share files.

## 2026-11-03

- Capped Shamir splits at k-of-n with n at most 8, and now reject duplicate or out-of-range share indexes.
- Share backups include an HMAC-SHA256 integrity MAC next to the existing checksum; older checksum-only files still decode.
- The CLI fails clearly on oversized `--total` values and on combine-from-files when two backups share the same x.

## 2026-11-05

- Published a frozen Shamir test-vector suite (linear, quadratic, wrap-around, and a wide scalar) and a deterministic split helper that evaluates caller-supplied coefficients.
- Added a chain-agnostic transaction object (`from`, `to`, `value`, `data`) with validation, versioned JSON encode/decode, and a stable SHA-256 digest.
- Tickets on the roadmap for the vector suite and the transaction model are marked done.

## 2026-11-04

- Added a small policy engine: named signers, an approval threshold, and per-asset spend caps checked before a request is allowed.
- Policies live in a process-local store that can be saved and loaded as versioned JSON.
- Unknown signers, duplicate approvals, and amounts over the matched cap are denied.

## 2026-11-06

- Added a pure transaction simulation module: gas, fee, and total outflow from a configurable mock cost model, with an optional spend-limit check (headroom or excess).
- Fixed the share encryption helper so `npm run build` type-checks cleanly.
- The roadmap item for the simulation module is marked done.
- Pre-sign now validates the transfer, evaluates custody policy, and can run the mock simulator (including a value-plus-fee check against the matched cap).
- Added a single-party ECDSA wrapper for compact low-S signatures, plus helpers to sign and verify a transaction digest.
- Roadmap items for the pre-sign pipeline and the ECDSA signing wrapper are marked done.
