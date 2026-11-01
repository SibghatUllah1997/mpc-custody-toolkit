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
  }
}
```

- `data.x`: share index (positive integer)
- `data.y`: 32‑byte share value as lowercase hex (no 0x)
- `checksum`: first 8 bytes (16 hex chars) of SHA‑256 over `JSON.stringify(data)`

Notes:
- The checksum detects accidental corruption or truncation but is not a MAC. A keyed integrity tag will be added in a later roadmap item.
- JSON field order is fixed by the writer; consumers must not depend on whitespace.

## Example

```json
{
  "version": 1,
  "type": "shamir-share",
  "data": { "x": 2, "y": "65c3...e9" },
  "checksum": { "algo": "sha256", "hex": "7c4a1f2b8c0d9e33" }
}
```

## Future compatibility
- Newer versions will increment `version` and may add fields
- Readers should reject unknown `type` or unsupported `version`

