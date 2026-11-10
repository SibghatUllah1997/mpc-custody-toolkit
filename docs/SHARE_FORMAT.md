# Share Backup Encoding (v2)

This project encodes individual Shamir shares as a small JSON object with a compact checksum. The goal is human‑readable backups that can be validated before use.

## Structure

```json
{
  "version": 2,
  "type": "shamir-share",
  "data": {
    "x": 1,
    "y": "<64‑hex‑lowercase>",
    "set": { "id": "<16-hex>", "threshold": 2, "total": 3 }
  },
  "checksum": {
    "algo": "sha256",
    "hex": "<16‑hex‑lowercase>"
  },
  "mac": {
    "algo": "hmac-sha256",
    "hex": "<64‑hex‑lowercase>"
  }
}
```

- `data.x`: share index (integer in 1..8)
- `data.y`: 32‑byte share value as lowercase hex (no 0x)
- `data.set` (optional, v2): which split the share belongs to. `id` is 8 random bytes shared by every share of one split; `threshold` and `total` describe that split. Because it sits inside `data`, it is covered by the checksum and MAC.
- `checksum`: first 8 bytes (16 hex chars) of SHA‑256 over the canonical JSON of `data`
- `mac`: HMAC‑SHA256 (full 32 bytes) over the same canonical JSON, using the public domain string `mpc-custody-toolkit/share-mac/v1` as the HMAC key

Notes:
- The checksum and MAC both detect accidental corruption or truncation.
- The default MAC key is public (a domain separator), so it is not a secret authenticator against someone who knows this format. Password‑based encryption at rest is a separate optional layer.
- From v2 the `mac` is required. Version‑1 backups (with or without `mac`) still load: they are checked under the v1 rules, then upgraded in memory.
- Combining from files rejects shares whose `set.id` differs, a mix of tagged and untagged files, and fewer files than `set.threshold`.
- JSON field order is fixed by the writer; consumers must not depend on whitespace.

## Example

```json
{
  "version": 2,
  "type": "shamir-share",
  "data": { "x": 2, "y": "65c3...e9" },
  "checksum": { "algo": "sha256", "hex": "7c4a1f2b8c0d9e33" },
  "mac": { "algo": "hmac-sha256", "hex": "a1b2...cdef" }
}
```

## Compatibility
- Newer versions increment `version`; this build reads v1 and v2 and writes v2.
- Files from a newer toolkit fail with a `SchemaError` (`newer-version`) instead of a vague parse error. See [SCHEMAS.md](SCHEMAS.md).

