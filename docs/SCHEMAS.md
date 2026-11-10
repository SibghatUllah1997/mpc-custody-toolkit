# Versioned Schemas

Every file this toolkit writes starts with `{ "type": ..., "version": ... }`. `src/schema` reads that header and upgrades older files one version at a time.

| Type | Reads | Writes | v2 change |
| --- | --- | --- | --- |
| `shamir-share` | 1, 2 | 2 | mandatory MAC; optional `data.set` (split id, threshold, total) |
| `policy-store` | 1, 2 | 2 | SHA-256 `digest` over the policy list |

## Rules

- Each format declares a `SchemaSpec`: `type`, `minVersion`, `currentVersion`, and one migration per step (`migrations[v]` turns v into v + 1).
- Integrity checks for an old version run inside its migration, before the file is re-sealed in the new shape. An old file is never trusted more than its own rules allow.
- Upgrades happen in memory only. Files on disk change only when the caller writes them again.
- Errors are `SchemaError` with a `code`: `invalid-json`, `not-an-object`, `unknown-type`, `missing-version`, `unsupported-version` (too old), `newer-version` (written by a newer toolkit).

## Adding a version

1. Add the new type next to the old one and bump `currentVersion`.
2. Add `migrations[old]` that checks the old file and returns the new shape.
3. Keep a test that loads a hand-built file of every readable version.
