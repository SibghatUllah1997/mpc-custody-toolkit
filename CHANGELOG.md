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
