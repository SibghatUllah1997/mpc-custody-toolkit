## 30‑Day Roadmap

Focus: a minimal but real MPC/custody toolkit with a threshold signing demo, key‑share backup and recovery, a simple policy engine, transaction simulation, and strong tests/docs.

Note: each day is one small, shippable step.

1. [ ] Ship foundation: secp256k1 keygen, Shamir split/combine, tests, CI.
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
24. [ ] Add fuzz tests for combine under malformed/duplicate shares.
25. [ ] Benchmark keygen/split/combine; record results in docs.
26. [ ] Add GitHub Pages docs site scaffold (Docusaurus or mdbook).
27. [ ] Provide TypeScript types and API reference tables.
28. [ ] Harden input validation and error messages (DX pass).
29. [ ] CI enhancements: matrix of Node LTS versions; code coverage.
30. [ ] Tag v0.1.0, write release notes, and publish docs site.
