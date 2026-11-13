# Release notes

Each `## v<version>` section is published as the GitHub release body when the
matching tag is pushed (see `.github/workflows/release.yml`).

## v0.1.0 — 2026-11-13

First tagged release. This is an educational toolkit: the threshold demo
recombines the key in one place and is not real MPC. Read `THREAT_MODEL.md`
before using any of it with real funds.

### What's in it

- secp256k1 key generation and single-party ECDSA signing via `@noble/curves`.
- Shamir split/combine over the curve order (k-of-n, n ≤ 8) with fixed test
  vectors and seeded fuzz tests for malformed and duplicate shares.
- Share backups as versioned JSON with a SHA-256 checksum, an HMAC-SHA256 MAC,
  optional password encryption at rest, and NDJSON streaming for large sets.
- A small policy engine (signers, thresholds, per-asset caps) with a versioned
  in-memory store, a chain-agnostic transaction model, a mock cost simulator,
  and a pre-sign pipeline that runs policy and simulation before signing.
- A 2-of-3 offline threshold signing demo and human-readable signing prompts.
- The `mpc-toolkit` CLI with `--json`, colors, leveled logs, coded input
  errors with hints, and a `bench` command.
- Typed ESM entry, generated API reference tables, and an mdbook docs site.

### Compatibility

- Node 20 or newer (CI runs 20, 22, and 24).
- Share files write schema v2; v1 files still load. Policy snapshots write v2;
  v1 snapshots are upgraded on load.

### Known limits

- No real distributed key generation or multi-party signing rounds.
- Simulation fees are mocked; nothing talks to a chain.
- Not published to npm; install from the tagged source.
