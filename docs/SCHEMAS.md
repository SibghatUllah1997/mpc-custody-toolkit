# Versioned Schemas

Every file this toolkit writes starts with `{ "type": ..., "version": ... }`. `src/schema` reads that header and upgrades older files one version at a time.

| Type | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `shamir-share` | 1, 2 | 2 | v2: mandatory MAC; optional `data.set` (split id, threshold, total) |
| `policy-store` | 1, 2 | 2 | v2: SHA-256 `digest` over the policy list |
| `audit-event` | 1 | 1 | JSONL line; checksum plus `prev` hash of the previous sealed event |
| `approval-item` | 1 | 1 | Pending request plus signed approver receipts; optional `expiresAt`, `delaySeconds`, and `readyAt`; SHA-256 checksum |
| `approval-queue` | 1 | 1 | JSON list of approval items with a checksum over item ids |
| `airgap-sign-request` | 1, 2 | 2 | v2: optional `expiresAt`; v1 files upgrade in memory and have no expiry |
| `airgap-sign-response` | 1 | 1 | Compact signature bound to a request id, digest, and public key |
| `airgap-spent-request` | 1 | 1 | JSONL line: request id this machine has already signed |
| `policy-snapshot` | 1 | 1 | One frozen policy plus compact ECDSA signature; optional `expiresAt` |

## Rules

- Each format declares a `SchemaSpec`: `type`, `minVersion`, `currentVersion`, and one migration per step (`migrations[v]` turns v into v + 1).
- Integrity checks for an old version run inside its migration, before the file is re-sealed in the new shape. An old file is never trusted more than its own rules allow.
- Upgrades happen in memory only. Files on disk change only when the caller writes them again.
- Errors are `SchemaError` with a `code`: `invalid-json`, `not-an-object`, `unknown-type`, `missing-version`, `unsupported-version` (too old), `newer-version` (written by a newer toolkit).

## Adding a version

1. Add the new type next to the old one and bump `currentVersion`.
2. Add `migrations[old]` that checks the old file and returns the new shape.
3. Keep a test that loads a hand-built file of every readable version.
