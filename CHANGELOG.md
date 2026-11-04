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

## 2026-11-04

- Added a small policy engine: named signers, an approval threshold, and per-asset spend caps checked before a request is allowed.
- Policies live in a process-local store that can be saved and loaded as versioned JSON.
- Unknown signers, duplicate approvals, and amounts over the matched cap are denied.
