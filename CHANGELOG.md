## 2026-11-19

- Personal messages (EIP-191) and typed data (EIP-712) hash with keccak-256, and signing prompts now show those digests (`hash-message`, `hash-typed`, `prompt --text` / `--typed`).
- Roadmap item for EIP-191 / EIP-712 hashing is marked done.
- Optional BIP-39 / BIP-32 keygen path via `@scure/bip39` and `@scure/bip32` (new `Hd` module): `keygen --new-mnemonic [--words 12|24]` creates words and derives a key, and `keygen --mnemonic-file` (with optional `--passphrase-file` and `--path`, default `m/44'/60'/0'/0/0`) restores it. Output includes the path, xpub, and master fingerprint.
- Mnemonics are only read from files, never from argv, so they stay out of shell history; bad checksums and malformed paths fail with coded errors.
- Roadmap item for BIP-39 mnemonics and BIP-32 HD derivation is marked done.

## 2026-11-18

- Policy decisions and pre-sign outcomes can be written to an append-only JSONL audit log (`audit-append` / `audit-read`) with a hash chain so earlier lines cannot be rewritten quietly.
- Spend limits may name per-asset destination allowlists and denylists; unknown or blocked `to` addresses are denied before signing.
- Roadmap items for the audit log and destination lists are marked done.
- Policies may set `signerLimits` (per-signer `cooldownSeconds` and/or `maxApprovals` per `windowSeconds`). Callers pass recent approvals as `activity`; a missing history fails closed with `activity-required`, and `MemoryApprovalLedger` keeps that history in memory.
- Roadmap item for the per-signer cooldown and rate limit is marked done.

## 2026-11-17

- Encrypted share export now rejects weak passphrases (at least 12 characters mixing case, digits, and symbols) and requires a matching confirmation (`--confirm-password`, or a TTY re-entry).
- `recover-dry-run` checks share integrity and threshold, then reports the recovered public key without printing the secret.
- Roadmap items for passphrase checks and the recovery dry-run are marked done.
- `rotate-shares` (and `Recovery.rotateShareSet` / `rotateShareFiles`) re-split the same key into a new (k, n) set with a fresh set id, verify the written files rebuild the same public key, then rename the old files to `*.retired`.
- Rotation never overwrites files, cleans up on failure, and will not turn encrypted backups into plaintext unless `--allow-plaintext` is given.
- Tests allow up to 30s each, since Argon2id share encryption is slow under coverage.
- Roadmap item for share rotation is marked done.

## 2026-11-16

- Encrypted share backups now use Argon2id via `@noble/hashes` (19 MiB memory, 2 passes, parallelism 1, per OWASP) and still wrap the payload in AES-256-GCM.
- Version 1 scrypt envelopes keep decrypting; decrypt caps reject oversized KDF parameters so a crafted file cannot exhaust memory.
- Roadmap item for the Argon2id upgrade is marked done.

## 2026-11-13

- Version 0.1.0: `docs/RELEASE_NOTES.md` holds per-version notes (also in the docs site), and `mpc-toolkit --version` / `version` print the package version.
- Added `src/release` (semver parse, tag-vs-version check, notes extraction) and a `release-notes` CLI command.
- New tag-triggered release workflow builds, tests, refuses a tag that does not match `package.json`, and publishes the notes as the GitHub release with the built docs site attached.
- Docs workflow keeps the built site as an artifact; the Pages deploy only runs when the `PAGES_ENABLED` repo variable is `true`, so main no longer fails while Pages is off.
- Roadmap item for the v0.1.0 tag, release notes, and docs site is marked done.
- Added a keygen → split → combine roundtrip (`mpc-toolkit check`) so the secp256k1/Shamir foundation can be verified in one call.
- CI runs that check after tests, and a short foundation guide is in the docs site.
- Roadmap item for the foundation ship is marked done.

## 2026-11-12

- Hardened CLI and library input checks: missing flag values, non-integer thresholds, and malformed share JSON now fail with coded InputError messages and hints.
- CI now tests Node 20, 22, and 24, and uploads an lcov coverage report from the test run.
- Roadmap items for the DX validation pass and CI matrix/coverage are marked done.

- Fixed the package entry: `main`/`types` pointed at missing files and `src/index.ts` used extensionless imports, so `import 'mpc-custody-toolkit'` failed under Node. Added an `exports` map with types.
- Added generated API reference tables (`docs/API.md`, also in the docs site) built from the public exports with the TypeScript compiler; a test fails if the page drifts (`npm run docs:api` refreshes it).
- Roadmap item for TypeScript types and API reference tables is marked done.

## 2026-11-11

- Added seeded property-based fuzz tests (`fast-check`) for `combineShares` covering duplicate x, malformed x/y, junk entries, too-few shares, and corrupted backup files.
- Fuzzing found two gaps, now fixed: combine accepted a share `y` at or above the curve order (silently reducing it to a wrong key) and threw a raw `TypeError` on `null` entries.
- Roadmap item for combine fuzz tests is marked done.
- Added a keygen/split/combine timer (`mpc-toolkit bench`) and recorded numbers in `docs/BENCHMARKS.md`.
- Scaffolded an mdbook docs site under `website/` (sidebar generated from the in-repo page catalog).
- Roadmap items for Shamir benchmarks and the docs site scaffold are marked done.

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
