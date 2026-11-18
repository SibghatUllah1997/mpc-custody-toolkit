## 30‑Day Roadmap

Focus: a minimal but real MPC/custody toolkit with a threshold signing demo, key‑share backup and recovery, a simple policy engine, transaction simulation, and strong tests/docs.

Note: each day is one small, shippable step.

1. [x] Ship foundation: secp256k1 keygen, Shamir split/combine, tests, CI. (2026‑11‑13)
2. [x] Add CLI scaffolding (`mpc-toolkit`): `keygen`, `split`, `combine`. (2026‑10‑31)
3. [x] Add hex/bytes utilities and safer input validation across modules. (2026‑10‑31)
4. [x] Document threat model and explicit non‑goals for v0. (2026‑11‑01)
5. [x] Implement share encoding format (JSON + checksum) for backups. (2026‑11‑01)
6. [x] Add share file import/export in CLI with validation. (2026‑11‑02)
7. [x] Add optional encryption-at-rest for shares (password‑based). (2026‑11‑02)
8. [x] Implement k-of-n split where n ≤ 8 and validate uniqueness of x. (2026‑11‑03)
9. [x] Add share integrity MAC using `@noble/hashes` (BLAKE3 or SHA‑256). (2026‑11‑03)
10. [x] Build a tiny “policy engine” interface (signers, thresholds, limits). (2026‑11‑04)
11. [x] Add a local in‑memory policy store with JSON serialization. (2026‑11‑04)
12. [x] Implement a deterministic test vector suite for Shamir routines. (2026‑11‑05)
13. [x] Add transaction object model (chain‑agnostic: from, to, value, data). (2026‑11‑05)
14. [x] Add “simulation” module: pure function cost/limit estimator (mock). (2026‑11‑06)
15. [x] Integrate policy checks into a “pre‑sign” validation pipeline. (2026‑11‑06)
16. [x] Add ECDSA signing wrapper (single‑party) via `@noble/curves`. (2026‑11‑06)
17. [x] Create a toy threshold signing demo (2‑of‑3, offline combine). (2026‑11‑09)
18. [x] Add human‑readable signing prompts (what is being signed?). (2026‑11‑09)
19. [x] Improve CLI UX: colors, helpful errors, `--json` output flag. (2026‑11‑09)
20. [x] Add basic logging with levels (error/warn/info/debug). (2026‑11‑09)
21. [x] Introduce versioned share and policy schemas. (2026‑11‑10)
22. [x] Add Node stream helpers for large backup import/export. (2026‑11‑10)
23. [x] Create docs/examples: sample custody workflow end‑to‑end. (2026‑11‑10)
24. [x] Add fuzz tests for combine under malformed/duplicate shares. (2026‑11‑11)
25. [x] Benchmark keygen/split/combine; record results in docs. (2026‑11‑11)
26. [x] Add GitHub Pages docs site scaffold (Docusaurus or mdbook). (2026‑11‑11)
27. [x] Provide TypeScript types and API reference tables. (2026‑11‑12)
28. [x] Harden input validation and error messages (DX pass). (2026‑11‑12)
29. [x] CI enhancements: matrix of Node LTS versions; code coverage. (2026‑11‑12)
30. [x] Tag v0.1.0, write release notes, and publish docs site. (2026‑11‑13)

## Phase 2

Focus: harden share backup and recovery, make policy decisions auditable, and add standard message hashing plus an offline signing flow. Each item is one small, shippable step. Crypto stays on audited libraries only (`@noble/*`, `@scure/*`). This project remains educational and is not for real funds.

31. [x] Upgrade share encryption to Argon2id via `@noble/hashes`, with documented memory and time parameters. (2026‑11‑16)
32. [x] Add passphrase strength checks and a confirmation prompt for encrypted share export. (2026‑11‑17)
33. [x] Add a recovery dry-run that validates share integrity and threshold without printing the secret. (2026‑11‑17)
34. [x] Implement share rotation: re-split a reconstructed key into a new (k, n) set and retire the old files. (2026‑11‑17)
35. [x] Add an append-only JSONL audit log of policy decisions and pre-sign outcomes. (2026‑11‑18)
36. [x] Extend the policy engine with per-asset destination allowlists and denylists. (2026‑11‑18)
37. [x] Add a per-signer cooldown and rate limit to the policy engine. (2026‑11‑18)
38. [ ] Hash EIP-191 personal messages and EIP-712 typed data with `@noble/hashes` and show them in signing prompts.
39. [ ] Add BIP-39 mnemonic and BIP-32 HD derivation via `@scure/bip39` and `@scure/bip32` as an optional keygen path.
40. [ ] Add an air-gap signing flow: export an unsigned request file, import a signature, and verify it offline.
41. [ ] Add a local pending-approval queue that requires k distinct approver receipts before pre-sign proceeds.
42. [ ] Refresh the threat model for v0.2 (KDF, audit log, air-gap assumptions) and add ceremony runbooks.
