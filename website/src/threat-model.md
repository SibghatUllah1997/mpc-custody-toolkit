# Threat Model and Non‑Goals (v0.2)

This project is an educational toolkit focused on threshold/MPC custody concepts. It is not audited and must not be used to secure real funds. The scope and assumptions below cover v0.2: Argon2id share encryption, a local audit log, an air-gap request/response flow, and a pending-approval queue.

## Assets
- Private key material and Shamir shares derived from a secp256k1 private key
- CLI inputs/outputs and on-disk share backups (plain JSON or Argon2id + AES-256-GCM)
- Air-gap request and response files, pending-approval queue files, and the append-only JSONL audit log

## Trust and Environment Assumptions
- Single developer workstation or CI runner with local filesystem access for online steps
- Air-gap signing uses two machines that share files only by sneakernet (USB, SD card). The offline machine never has a network path to the online one
- The operator reads the offline signing prompt before confirming. Request checksums catch copy damage; they are not a MAC
- No hostile co-tenants on either machine (not hardened for multitenancy)
- Node.js 20+ runtime with audited crypto libraries (`@noble/*`, `@scure/*`)
- No persistent network service; the CLI runs as an offline tool

## Adversaries Considered
- Accidental misuse and common developer errors (handled via strict validation)
- Corruption or truncation of backup, request, queue, or audit files (checksums, HMAC-SHA256 on shares, hash-chained audit lines)
- Duplicate or malformed shares during reconstruction (validated and rejected)
- Replay of an approver receipt onto a different request id or digest (domain-separated receipt hashes)
- A signature file bound to the wrong request id, digest, or public key (air-gap verify fails closed)

## Adversaries Out of Scope (v0.2)
- Active malware on either host (keyloggers, memory scrapers, rootkits)
- Side-channel attacks (timing, cache, EM/power analysis)
- Supply-chain compromise of dependencies or toolchain
- Targeted physical attacks against storage media or hardware
- Remote/network attackers — the toolkit exposes no network surface
- An operator who confirms an air-gap prompt without reading it, or who copies the wrong request file

## Non‑Goals (v0.2)
- Production key ceremonies, HSM/TEE integrations, or chain-native transaction encoding
- Distributed threshold signing protocols (the 2-of-3 demo still reconstructs, then signs as one party)
- Selecting KDF parameters for high-value or online-attack settings beyond the documented Argon2id defaults (19 MiB, 2 passes, parallelism 1)
- Remote policy enforcement, multi-host approval, or a durable control plane (the policy store and approval queue are local files)
- Encrypted transport, network services, or remote state management
- Remote spent-request logs, or treating a local spent-request file as a MAC against a hostile operator

## KDF, audit log, and air-gap notes
- Encrypted share backups use Argon2id as documented in `docs/SHARE_FORMAT.md`. Decrypt caps reject oversized memory/time so a crafted file cannot exhaust the host. Version 1 scrypt envelopes still decrypt.
- The audit log is append-only JSONL with a per-line checksum and a `prev` hash. It is a local record, not a remote attestation. A torn or edited line fails the chain check and is not extended.
- Air-gap files are described in `docs/AIRGAP.md`. Optional `expiresAt` is refused on sign and verify once the instant has passed. `--spent-log` records request ids this machine has signed; deleting a line lets that id be signed again. The online side verifies against its own copy of the request. Output files are never overwritten; signing keys are read from `--key-file` only.

## Operational Guidance
- Keep share backups offline, verify checksums after copy/move, and store in distinct locations
- Use a strong password when encrypting share backups (Argon2id, 19 MiB, 2 passes)
- Treat all outputs as sensitive; rotate test keys frequently
- Follow `docs/CEREMONY.md` for the split, backup, approval, and air-gap runbooks
