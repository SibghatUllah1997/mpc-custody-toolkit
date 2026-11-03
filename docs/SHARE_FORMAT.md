# Share Backup Encoding (v1)

This project encodes individual Shamir shares as a small JSON object with a compact checksum. The goal is human‑readable backups that can be validated before use.

## Structure

```json
{
  "version": 1,
  "type": "shamir-share",
  "data": {
    "x": 1,
    "y": "<64‑hex‑lowercase>"
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
- `checksum`: first 8 bytes (16 hex chars) of SHA‑256 over the canonical JSON of `data`
- `mac`: HMAC‑SHA256 (full 32 bytes) over the same canonical JSON, using the public domain string `mpc-custody-toolkit/share-mac/v1` as the HMAC key

Notes:
- The checksum and MAC both detect accidental corruption or truncation.
- The default MAC key is public (a domain separator), so it is not a secret authenticator against someone who knows this format. Password‑based encryption at rest is a separate optional layer.
- Readers still accept version‑1 backups that omit `mac` (checksum only) so older files remain usable.
- JSON field order is fixed by the writer; consumers must not depend on whitespace.

## Example

```json
{
  "version": 1,
  "type": "shamir-share",
  "data": { "x": 2, "y": "65c3...e9" },
  "checksum": { "algo": "sha256", "hex": "7c4a1f2b8c0d9e33" },
  "mac": { "algo": "hmac-sha256", "hex": "a1b2...cdef" }
}
```

## Future compatibility
- Newer versions will increment `version` and may add fields
- Readers should reject unknown `type` or unsupported `version`

