# Threat Model and Non‑Goals (v0)

This project is an educational toolkit focused on threshold/MPC custody concepts. It is not audited and must not be used to secure real funds. The scope and assumptions below clarify what v0 intends to demonstrate and what it explicitly does not attempt to solve.

## Assets
- Private key material and Shamir shares derived from a secp256k1 private key
- CLI inputs/outputs and on‑disk share backups produced by this toolkit

## Trust and Environment Assumptions
- Single developer workstation or CI runner with local filesystem access
- No hostile co‑tenants on the same machine (i.e., not hardened for multitenancy)
- Node.js 20+ runtime with audited crypto libraries (`@noble/*`)
- No persistent network service; the CLI runs as an offline tool

## Adversaries Considered
- Accidental misuse and common developer errors (handled via strict validation)
- Corruption or truncation of backup files (mitigated with checksums)
- Duplicate or malformed shares during reconstruction (validated and rejected)

## Adversaries Out of Scope (v0)
- Active malware on the host (keyloggers, memory scrapers, rootkits)
- Side‑channel attacks (timing, cache, EM/power analysis)
- Supply‑chain compromise of dependencies or toolchain
- Targeted physical attacks against storage media or hardware
- Remote/network attackers — the toolkit exposes no network surface

## Non‑Goals (v0)
- Key ceremony automation, HSM/TEE integrations, or air‑gap workflows
- Distributed threshold signing protocols (only a toy/demo will be provided later)
- Password hardening/KDF tuning beyond basic, audited primitives (deferred)
- Policy, approvals, and audit trails beyond simple local stubs
- Encrypted transport, network services, or remote state management

## Operational Guidance
- Keep share backups offline, verify checksums after copy/move, and store in distinct locations
- Use strong passwords where optional encryption is later supported
- Treat all outputs as sensitive; rotate test keys frequently

