## 30‑Day Roadmap

Focus: a minimal but real MPC/custody toolkit with a threshold signing demo, key‑share backup and recovery, a simple policy engine, transaction simulation, and strong tests/docs.

Note: each day is one small, shippable step.

1. [ ] Ship foundation: secp256k1 keygen, Shamir split/combine, tests, CI.
2. [x] Add CLI scaffolding (`mpc-toolkit`): `keygen`, `split`, `combine`. (2026‑10‑31)
3. [x] Add hex/bytes utilities and safer input validation across modules. (2026‑10‑31)
4. [x] Document threat model and explicit non‑goals for v0. (2026‑11‑01)
5. [ ] Implement share encoding format (JSON + checksum) for backups.
6. [ ] Add share file import/export in CLI with validation.
7. [ ] Add optional encryption-at-rest for shares (password‑based).
8. [ ] Implement k-of-n split where n ≤ 8 and validate uniqueness of x.
9. [ ] Add share integrity MAC using `@noble/hashes` (BLAKE3 or SHA‑256).
10. [ ] Build a tiny “policy engine” interface (signers, thresholds, limits).
11. [ ] Add a local in‑memory policy store with JSON serialization.
12. [ ] Implement a deterministic test vector suite for Shamir routines.
13. [ ] Add transaction object model (chain‑agnostic: from, to, value, data).
14. [ ] Add “simulation” module: pure function cost/limit estimator (mock).
15. [ ] Integrate policy checks into a “pre‑sign” validation pipeline.
16. [ ] Add ECDSA signing wrapper (single‑party) via `@noble/curves`.
17. [ ] Create a toy threshold signing demo (2‑of‑3, offline combine).
18. [ ] Add human‑readable signing prompts (what is being signed?).
19. [ ] Improve CLI UX: colors, helpful errors, `--json` output flag.
20. [ ] Add basic logging with levels (error/warn/info/debug).
21. [ ] Introduce versioned share and policy schemas.
22. [ ] Add Node stream helpers for large backup import/export.
23. [ ] Create docs/examples: sample custody workflow end‑to‑end.
24. [ ] Add fuzz tests for combine under malformed/duplicate shares.
25. [ ] Benchmark keygen/split/combine; record results in docs.
26. [ ] Add GitHub Pages docs site scaffold (Docusaurus or mdbook).
27. [ ] Provide TypeScript types and API reference tables.
28. [ ] Harden input validation and error messages (DX pass).
29. [ ] CI enhancements: matrix of Node LTS versions; code coverage.
30. [ ] Tag v0.1.0, write release notes, and publish docs site.
